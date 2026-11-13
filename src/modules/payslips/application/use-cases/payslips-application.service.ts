import { createHash, randomBytes, randomUUID } from 'crypto';
import { Op, QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../../../../infra/database';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../shared/errors/app.error';
import { EmployeeModel } from '../../../employees/infrastructure/persistence/model/employee.model';
import { CompanyModel } from '../../../tenancy/infrastructure/persistence/model/company.model';
import { PayrollEmployeeResultModel, PayrollPeriodModel, PayrollRunModel } from '../../../payroll/infrastructure/payroll.models';
import { hash, money, cents, validateCalculation } from '../../../payroll/domain/payroll-result';
import { payrollPdf, payrollXlsx } from '../../../payroll/infrastructure/payroll-export';
import { PayslipDocumentStorage, FileSystemPayslipStorage } from '../../infrastructure/document-storage.adapter';
import { PdfPayslipRenderer } from '../../infrastructure/pdf-payslip.renderer';
import {
  EmployeeUserLinkModel, PayslipAccessLogModel, PayslipBatchItemModel, PayslipBatchModel,
  PayslipCorrectionModel, PayslipDeliveryModel, PayslipDocumentModel, PayslipModel,
  PayslipOutboxModel, PayslipPolicyModel, PayslipPublicationModel, PayslipTemplateModel,
  PayslipTemplateVersionModel,
} from '../../infrastructure/payslips.models';

export type PayslipStatus = 'PENDING'|'GENERATING'|'GENERATED'|'VALIDATED'|'PUBLISHED'|'SUPERSEDED'|'GENERATION_FAILED'|'PUBLICATION_FAILED'|'ARCHIVED';
export type PayslipType = 'REGULAR'|'OFF_CYCLE'|'SUPPLEMENTARY'|'RETROACTIVE'|'CORRECTION'|'TERMINATION'|'DUPLICATE_COPY';
export interface PayslipLine { code: string; description: string; type: 'EARNING'|'DEDUCTION'|'EMPLOYER_COST'; amount: string; displayOrder: number; sourceReference: string; }
export interface PayslipSnapshot {
  tenantId: string; employeeId: string; payrollRunId: string; payrollResultId: string;
  employer: { name: string; taxId: string; address?: string | null };
  employee: { fullName: string; employeeCode: string; taxId?: string | null; department?: string | null; jobTitle?: string | null };
  period: { startDate: string; endDate: string };
  earnings: PayslipLine[]; deductions: PayslipLine[]; employerCosts: PayslipLine[];
  grossAmount: string; totalDeductions: string; netAmount: string; employerCostsAmount: string;
  currency: string; payrollSnapshotHash: string; engineVersion: string; legalRuleSetVersion: string;
}
type RecordData = Record<string, any>;
const now = () => new Date().toISOString();
const rec = (model: any) => model.toJSON() as { id: string; companyId: number; status: string; runId: string|null; employeeId: string|null; key: string; data: RecordData };
const setTenant = async (companyId: number, transaction: Transaction) => {
  if (sequelize.getDialect() === 'postgres') await sequelize.query("SELECT set_config('app.current_tenant', :tenant, true)", { replacements: { tenant: String(companyId) }, type: QueryTypes.SELECT, transaction });
};

export class PayslipsApplicationService {
  private readonly storage: PayslipDocumentStorage;
  private readonly renderer = new PdfPayslipRenderer();
  private batchEnqueuer?: (companyId:number,actorUserId:number,batchId:string)=>Promise<void>;
  constructor(private readonly audit: AuditRecorderPort, storage?: PayslipDocumentStorage) { this.storage = storage ?? new FileSystemPayslipStorage(); }
  setBatchEnqueuer(enqueue:(companyId:number,actorUserId:number,batchId:string)=>Promise<void>) { this.batchEnqueuer=enqueue; }
  private present(data:RecordData) { const {documentStorageKey,verificationCodeHash,verificationCode,templateSnapshot,...publicData}=data; return publicData; }

  private async tenant<T>(companyId: number, operation: (transaction: Transaction) => Promise<T>): Promise<T> {
    return sequelize.transaction(async transaction => { await setTenant(companyId, transaction); return operation(transaction); });
  }
  private async findPayslip(companyId: number, id: string, transaction?: Transaction) {
    const row = await PayslipModel.findOne({ where: { companyId, id }, ...(transaction ? { transaction } : {}) });
    if (!row) throw new NotFoundError('Payslip');
    return rec(row);
  }
  private async findTemplateVersion(companyId: number, id: string, transaction?: Transaction) {
    const row = await PayslipTemplateVersionModel.findOne({ where: { companyId, id }, ...(transaction ? { transaction } : {}) });
    if (!row) throw new NotFoundError('Payslip template version');
    return rec(row);
  }

  async list(companyId: number, query: { page: number; limit: number; status?: string; employeeId?: string; type?: string }) {
    return this.tenant(companyId, async transaction => {
      const where={companyId,...(query.status?{status:query.status}:{}),...(query.employeeId?{employeeId:query.employeeId}:{})};
      if(query.type){const rows=(await PayslipModel.findAll({where,order:[['createdAt','DESC']],transaction})).map(rec).filter(row=>row.data.type===query.type);return {page:query.page,limit:query.limit,total:rows.length,data:rows.slice((query.page-1)*query.limit,query.page*query.limit).map(row=>this.present(row.data))};}
      const [rows,total]=await Promise.all([PayslipModel.findAll({where,order:[['createdAt','DESC']],limit:query.limit,offset:(query.page-1)*query.limit,transaction}),PayslipModel.count({where,transaction})]);
      return {page:query.page,limit:query.limit,total,data:rows.map(rec).map(row=>this.present(row.data))};
    });
  }

  async generate(companyId: number, actorUserId: number, input: { payrollRunId: string; payrollResultId: string; employeeId: string; templateVersionId: string; type?: PayslipType; idempotencyKey?: string }) {
    const created = await this.tenant(companyId, async transaction => {
      const run = await PayrollRunModel.findOne({ where: { companyId, id: input.payrollRunId }, transaction });
      if (!run || run.status !== 'CLOSED' || run.runType === 'SIMULATION') throw new ConflictError('A payslip requires a closed, non-simulation payroll run.');
      const result = await PayrollEmployeeResultModel.findOne({ where: { companyId, id: input.payrollResultId, runId: input.payrollRunId, employeeId: input.employeeId }, transaction });
      if (!result) throw new NotFoundError('Closed payroll result');
      const template = await this.findTemplateVersion(companyId, input.templateVersionId, transaction);
      if (template.status !== 'PUBLISHED') throw new ConflictError('Publish the template version before issuing payslips.');
      const emissionKey = `${input.payrollResultId}:${input.type ?? 'REGULAR'}`;
      const existing = await PayslipModel.findOne({ where: { companyId, key: emissionKey }, transaction });
      if (existing) {
        const previous = rec(existing);
        if (previous.data.templateVersionId !== input.templateVersionId) throw new ConflictError('This payroll result already has a payslip. Use a correction run or issue a duplicate copy.');
        if (previous.status !== 'GENERATION_FAILED') return { existing: previous };
        const retryData = { ...previous.data, status: 'GENERATING', updatedAt: now() };
        await existing.update({ status: 'GENERATING', data: retryData }, { transaction });
        return { retry: { item: { ...previous, status: 'GENERATING', data: retryData }, snapshot: previous.data.snapshot, template: previous.data.templateSnapshot, verificationCode: previous.data.verificationCode } };
      }
      const [period, employee, company] = await Promise.all([
        PayrollPeriodModel.findOne({ where: { companyId, id: run.periodId }, transaction }),
        EmployeeModel.findOne({ where: { companyId, id: input.employeeId }, transaction }),
        CompanyModel.findByPk(companyId, { transaction }),
      ]);
      if (!period || !employee || !company) throw new NotFoundError('Payroll period, employee or employer');
      const calculation = validateCalculation(result.get('calculationSnapshot'));
      if (calculation.employeeId !== input.employeeId || calculation.grossAmount !== String(result.get('grossAmount')) || calculation.deductionsAmount !== String(result.get('deductionsAmount')) || calculation.netAmount !== String(result.get('netAmount')) || calculation.employerCostsAmount !== String(result.get('employerCostsAmount'))) throw new ConflictError('Payroll result does not reconcile with its immutable calculation snapshot.');
      const earnings: PayslipLine[] = [], deductions: PayslipLine[] = [], employerCosts: PayslipLine[] = [];
      for (const [index,line] of calculation.lines.entries()) {
        const entry = { code: line.code, description: String((line as any).description ?? line.code), type: line.type, amount: line.amount, sourceReference: line.sourceReference, displayOrder: index+1 };
        if (line.type === 'EARNING') earnings.push(entry); else if (line.type === 'DEDUCTION') deductions.push(entry); else employerCosts.push(entry);
      }
      if (cents(calculation.grossAmount)-cents(calculation.deductionsAmount)!==cents(calculation.netAmount)) throw new ValidationError('Payroll result totals do not reconcile.');
      const snapshot: PayslipSnapshot = {
        tenantId: String(companyId), employeeId: input.employeeId, payrollRunId: input.payrollRunId, payrollResultId: input.payrollResultId,
        employer: { name: company.name, taxId: company.nif ?? '', address: null },
        employee: { fullName: `${employee.firstName} ${employee.lastName}`.trim(), employeeCode: employee.employeeNumber, taxId: null, department: employee.departmentId ? String(employee.departmentId) : null, jobTitle: employee.jobTitle },
        period: { startDate: String(period.startDate), endDate: String(period.endDate) }, earnings, deductions, employerCosts,
        grossAmount: calculation.grossAmount, totalDeductions: calculation.deductionsAmount, netAmount: calculation.netAmount,
        employerCostsAmount: calculation.employerCostsAmount, currency: calculation.currency,
        payrollSnapshotHash: hash({ id: result.get('id'), companyId, runId: input.payrollRunId, calculation: result.get('calculationSnapshot') }),
        engineVersion: calculation.engineVersion, legalRuleSetVersion: calculation.legalRuleSetVersion,
      };
      const id = randomUUID(), issuedAt = now(), verificationCode = randomBytes(12).toString('hex').toUpperCase();
      const number = `PSL-${String(period.startDate).slice(0,7).replace('-','')}-${id.slice(0,8).toUpperCase()}`;
      const data = { id, companyId, employeeId: input.employeeId, payrollRunId: input.payrollRunId, payrollResultId: input.payrollResultId, number, type: input.type ?? 'REGULAR', status: 'GENERATING', grossAmount: snapshot.grossAmount, totalDeductions: snapshot.totalDeductions, netAmount: snapshot.netAmount, currency: snapshot.currency, templateVersionId: template.id, templateSnapshot: template.data, documentId: id, verificationCodeHash: createHash('sha256').update(verificationCode).digest('hex'), verificationCode, createdAt: issuedAt, updatedAt: issuedAt, issuedAt, snapshot };
      const row = await PayslipModel.create({ id, companyId, status: 'GENERATING', runId: input.payrollRunId, employeeId: input.employeeId, key: emissionKey, data }, { transaction });
      await PayslipOutboxModel.create({ id: randomUUID(), companyId, status: 'PENDING', runId: input.payrollRunId, employeeId: input.employeeId, key: `payslip.generated:${id}`, data: { eventType: 'payslips.payslip.generation-started', aggregateId: id, actorUserId } }, { transaction });
      return { item: rec(row) as any, snapshot, template: template.data, verificationCode };
    });
    if ((created as any).existing) return this.present((created as any).existing.data);
    if ((created as any).retry) return this.renderAndStore(companyId, actorUserId, (created as any).retry);
    const { item, snapshot, template, verificationCode } = created as any;
    return this.renderAndStore(companyId, actorUserId, { item, snapshot, template, verificationCode });
  }

  private async renderAndStore(companyId:number,actorUserId:number,source:{item:any;snapshot:PayslipSnapshot;template:RecordData;verificationCode:string}) {
    const { item, snapshot, template, verificationCode } = source;
    try {
      const bytes = this.renderer.render({ ...snapshot, payslipNumber: item.data.number, issuedAt: item.data.issuedAt, verificationCode, template: template.layoutConfig ?? {} });
      const documentHash = createHash('sha256').update(bytes).digest('hex');
      const storageKey = await this.storage.put(companyId, item.id, bytes);
      const completed = await this.tenant(companyId, async transaction => {
        const row = await PayslipModel.findOne({ where: { companyId, id: item.id }, transaction, lock: transaction.LOCK.UPDATE });
        if (!row) throw new NotFoundError('Payslip');
        const data = { ...row.get('data') as RecordData, status: 'VALIDATED', documentHash, documentStorageKey: storageKey, updatedAt: now() };
        await row.update({ status: 'VALIDATED', data }, { transaction });
        await PayslipDocumentModel.create({ id: randomUUID(), companyId, status: 'STORED', runId: item.payrollRunId, employeeId: item.employeeId, key: item.id, data: { payslipId: item.id, storageKey, mimeType: 'application/pdf', fileHash: documentHash, size: bytes.length, generatedAt: now() } }, { transaction });
        await PayslipOutboxModel.create({ id: randomUUID(), companyId, status: 'PENDING', runId: item.payrollRunId, employeeId: item.employeeId, key: `payslip.validated:${item.id}`, data: { eventType: 'payslips.payslip.validated', aggregateId: item.id, documentHash } }, { transaction });
        return data;
      });
      await this.audit.record({ companyId, actorUserId, action: 'payslips.payslip.generated', entityType: 'payslip', entityId: item.id, after: { status: 'VALIDATED', employeeId: item.employeeId, documentHash } });
      return this.present(completed);
    } catch (error) {
      await this.tenant(companyId, async transaction => { const row = await PayslipModel.findOne({ where: { companyId, id: item.id }, transaction }); if (row) { await row.update({ status: 'GENERATION_FAILED', data: { ...row.get('data') as RecordData, status: 'GENERATION_FAILED', errorCode: 'DOCUMENT_GENERATION_FAILED', updatedAt: now() } }, { transaction }); await PayslipOutboxModel.create({id:randomUUID(),companyId,status:'PENDING',runId:item.payrollRunId,employeeId:item.employeeId,key:`payslip.generation-failed:${item.id}:${Date.now()}`,data:{eventType:'payslips.payslip.generation-failed',aggregateId:item.id,employeeId:item.employeeId,errorCode:'DOCUMENT_GENERATION_FAILED'}},{transaction}); } });
      await this.audit.record({companyId,actorUserId,action:'payslips.payslip.generation-failed',entityType:'payslip',entityId:item.id,after:{errorCode:'DOCUMENT_GENERATION_FAILED'}});
      throw error;
    }
  }

  async get(companyId: number, id: string) { return this.tenant(companyId, async transaction => this.present((await this.findPayslip(companyId,id,transaction)).data)); }
  async download(companyId: number, id: string, actorUserId: number, action: 'DOWNLOAD'|'PRINT' = 'DOWNLOAD') {
    const payslip = await this.tenant(companyId, async transaction => this.findPayslip(companyId,id,transaction));
    if (!['VALIDATED','PUBLISHED','SUPERSEDED','ARCHIVED'].includes(payslip.status)) throw new ConflictError('Payslip document is not available.');
    const file = await this.storage.read(String(payslip.data.documentStorageKey));
    if (createHash('sha256').update(file).digest('hex') !== payslip.data.documentHash) throw new ConflictError('Payslip document integrity check failed.');
    await this.logAccess(companyId,id,actorUserId,action);
    return { file, name: `${payslip.data.number}.pdf`, mimeType: 'application/pdf', hash: payslip.data.documentHash };
  }
  async preview(companyId: number,id: string) { const row=await this.tenant(companyId,tx=>this.findPayslip(companyId,id,tx)); return { id, status: row.data.status, preview: { employer:row.data.snapshot.employer,employee:row.data.snapshot.employee,period:row.data.snapshot.period,earnings:row.data.snapshot.earnings,deductions:row.data.snapshot.deductions,grossAmount:row.data.grossAmount,totalDeductions:row.data.totalDeductions,netAmount:row.data.netAmount,currency:row.data.currency } }; }
  async publish(companyId:number,actorUserId:number,id:string,input?:{channel?:string}) { return this.tenant(companyId,async transaction=>{ const row=await PayslipModel.findOne({where:{companyId,id},transaction,lock:transaction.LOCK.UPDATE}); if(!row)throw new NotFoundError('Payslip'); if(!['VALIDATED','PUBLISHED'].includes(row.status))throw new ConflictError('Only validated payslips can be published.'); if(row.status==='PUBLISHED')return rec(row).data; const publishedAt=now(), data:RecordData={...row.get('data') as RecordData,status:'PUBLISHED',publishedAt,updatedAt:publishedAt}; await row.update({status:'PUBLISHED',data},{transaction}); if(data.type==='CORRECTION'&&data.originalPayslipId){const original=await PayslipModel.findOne({where:{companyId,id:data.originalPayslipId},transaction,lock:transaction.LOCK.UPDATE});if(original){const originalData={...rec(original).data,status:'SUPERSEDED',supersededBy:id,updatedAt:publishedAt};await original.update({status:'SUPERSEDED',data:originalData},{transaction});}} await PayslipPublicationModel.create({id:randomUUID(),companyId,status:'PUBLISHED',runId:row.runId,employeeId:row.employeeId,key:id,data:{payslipId:id,publishedBy:actorUserId,channel:input?.channel??'PORTAL',publishedAt}},{transaction}); await PayslipDeliveryModel.create({id:randomUUID(),companyId,status:'PENDING',runId:row.runId,employeeId:row.employeeId,key:`portal:${id}`,data:{payslipId:id,channel:'PORTAL',status:'AVAILABLE',attemptedAt:publishedAt}},{transaction}); await PayslipOutboxModel.create({id:randomUUID(),companyId,status:'PENDING',runId:row.runId,employeeId:row.employeeId,key:`payslip.published:${id}`,data:{eventType:'payslips.payslip.published',aggregateId:id,actorUserId,employeeId:row.employeeId,payslipType:data.type}},{transaction}); return data; }).then(async data=>{await this.audit.record({companyId,actorUserId,action:'payslips.payslip.published',entityType:'payslip',entityId:id,after:{status:'PUBLISHED'}});return this.present(data);}); }
  async history(companyId:number,id:string) { return this.tenant(companyId,async transaction=>{const payslip=await this.findPayslip(companyId,id,transaction);const publications=await PayslipPublicationModel.findAll({where:{companyId,key:id},transaction});const access=await PayslipAccessLogModel.findAll({where:{companyId,key:id},order:[['createdAt','ASC']],transaction});const corrections=await PayslipCorrectionModel.findAll({where:{companyId,key:{[Op.like]:`${id}:%`}},transaction});return {payslip:this.present(payslip.data),events:[{type:'payslips.payslip.generated',at:payslip.data.createdAt},...publications.map(row=>rec(row).data),...access.map(row=>rec(row).data),...corrections.map(row=>rec(row).data)]};}); }
  async verification(companyId:number,id:string) { const row=await this.tenant(companyId,tx=>this.findPayslip(companyId,id,tx)); const file=await this.storage.read(String(row.data.documentStorageKey));const actual=createHash('sha256').update(file).digest('hex');await this.tenant(companyId,async tx=>{await PayslipAccessLogModel.create({id:randomUUID(),companyId,status:'ACTIVE',runId:row.runId,employeeId:row.employeeId,key:id,data:{payslipId:id,actorId:null,action:'VERIFY',verifiedAt:now(),valid:actual===row.data.documentHash}},{transaction:tx});});return {id,verificationCode:row.data.verificationCode,documentHash:row.data.documentHash,status:actual===row.data.documentHash?'VERIFIED':'INVALID',verifiedAt:now()}; }

  async listBatches(companyId:number) { return this.tenant(companyId,async tx=>(await PayslipBatchModel.findAll({where:{companyId},order:[['createdAt','DESC']],transaction:tx})).map(rec).map(row=>row.data)); }
  async createBatch(companyId:number,actor:number,input:{payrollRunId:string;templateVersionId:string;type:Exclude<PayslipType,'DUPLICATE_COPY'>;employeeIds:string[]}) { return this.tenant(companyId,async tx=>{const run=await PayrollRunModel.findOne({where:{companyId,id:input.payrollRunId,status:'CLOSED'},transaction:tx});if(!run||run.runType==='SIMULATION')throw new ConflictError('Batch generation requires a closed financial payroll run.');const version=await this.findTemplateVersion(companyId,input.templateVersionId,tx);if(version.status!=='PUBLISHED')throw new ConflictError('Template version must be published.');const results=await PayrollEmployeeResultModel.findAll({where:{companyId,runId:input.payrollRunId,employeeId:{[Op.in]:input.employeeIds}},transaction:tx});if(results.length!==new Set(input.employeeIds).size||input.employeeIds.length!==new Set(input.employeeIds).size)throw new ValidationError('Employees must be unique and have a result in the closed payroll.');const id=randomUUID(),createdAt=now();const data={id,companyId,payrollRunId:input.payrollRunId,templateVersionId:input.templateVersionId,type:input.type,status:'PENDING',totalItems:results.length,completedItems:0,failedItems:0,createdAt,updatedAt:createdAt,createdBy:actor};await PayslipBatchModel.create({id,companyId,status:'PENDING',runId:input.payrollRunId,employeeId:null,key:`batch:${id}`,data},{transaction:tx});for(const result of results){const employeeId=String(result.get('employeeId')), itemId=randomUUID();await PayslipBatchItemModel.create({id:itemId,companyId,status:'PENDING',runId:input.payrollRunId,employeeId,key:`${id}:${employeeId}`,data:{id:itemId,batchId:id,employeeId,payrollResultId:String(result.get('id')),status:'PENDING',errorCode:null,createdAt}},{transaction:tx});}await this.audit.record({companyId,actorUserId:actor,action:'payslips.batch.created',entityType:'payslip_batch',entityId:id,after:{totalItems:results.length}});return data;}); }
  async getBatch(companyId:number,id:string):Promise<RecordData> {return this.tenant(companyId,async tx=>{const batch=await PayslipBatchModel.findOne({where:{companyId,id},transaction:tx});if(!batch)throw new NotFoundError('Payslip batch');const itemRows=await PayslipBatchItemModel.findAll({where:{companyId,runId:batch.runId},transaction:tx});const data=rec(batch).data;return {...data,items:itemRows.map(rec).filter(item=>item.data.batchId===id).map(item=>item.data)};});}
  async generateBatch(companyId:number,actor:number,id:string) { const batch=await this.getBatch(companyId,id);await Promise.all(batch.items.filter((item:any)=>item.status!=='GENERATED').map((item:any)=>this.generateBatchItem(companyId,actor,id,item.id)));return this.refreshBatch(companyId,id); }
  async generateBatchItem(companyId:number,actor:number,batchId:string,itemId:string) { const batch=await this.getBatch(companyId,batchId);const item=batch.items.find((entry:any)=>entry.id===itemId);if(!item)throw new NotFoundError('Payslip batch item');if(item.status==='GENERATED')return item;try{await this.tenant(companyId,async tx=>{const row=await PayslipBatchItemModel.findOne({where:{companyId,id:itemId},transaction:tx,lock:tx.LOCK.UPDATE});if(row)await row.update({status:'GENERATING',data:{...rec(row).data,status:'GENERATING'}},{transaction:tx});});await this.generate(companyId,actor,{payrollRunId:batch.payrollRunId,payrollResultId:item.payrollResultId,employeeId:item.employeeId,templateVersionId:batch.templateVersionId,type:batch.type,idempotencyKey:item.id});await this.tenant(companyId,async tx=>{const row=await PayslipBatchItemModel.findOne({where:{companyId,id:itemId},transaction:tx});if(row)await row.update({status:'GENERATED',data:{...rec(row).data,status:'GENERATED'}},{transaction:tx});});}catch(error){await this.tenant(companyId,async tx=>{const row=await PayslipBatchItemModel.findOne({where:{companyId,id:itemId},transaction:tx});if(row)await row.update({status:'GENERATION_FAILED',data:{...rec(row).data,status:'GENERATION_FAILED',errorCode:'GENERATION_FAILED'}},{transaction:tx});});}await this.refreshBatch(companyId,batchId);return (await this.getBatch(companyId,batchId)).items.find((entry:any)=>entry.id===itemId); }
  private async refreshBatch(companyId:number,id:string) {return this.tenant(companyId,async tx=>{const batch=await PayslipBatchModel.findOne({where:{companyId,id},transaction:tx});if(!batch)throw new NotFoundError('Payslip batch');const rows=(await PayslipBatchItemModel.findAll({where:{companyId,runId:batch.runId},transaction:tx})).map(rec).filter(row=>row.data.batchId===id);const complete=rows.filter(row=>row.status==='GENERATED').length,failed=rows.filter(row=>row.status==='GENERATION_FAILED').length;const status=complete+failed===rows.length?(failed?'PARTIALLY_COMPLETED':'COMPLETED'):complete||failed?'STARTED':'PENDING';const data={...rec(batch).data,status,totalItems:rows.length,completedItems:complete,failedItems:failed,updatedAt:now()};await batch.update({status,data},{transaction:tx});return {...data,items:rows.map(row=>row.data)};});}
  async getBatchProgress(companyId:number,id:string) {const batch=await this.getBatch(companyId,id);return {id,status:batch.status,total:batch.totalItems,completed:batch.completedItems,failed:batch.failedItems,pending:batch.totalItems-batch.completedItems-batch.failedItems};}
  async requestBatchGeneration(companyId:number,actor:number,id:string):Promise<RecordData> { if(!this.batchEnqueuer)return this.generateBatch(companyId,actor,id);const batch=await this.getBatch(companyId,id);if(batch.status==='COMPLETED')return batch;await this.tenant(companyId,async tx=>{const row=await PayslipBatchModel.findOne({where:{companyId,id},transaction:tx,lock:tx.LOCK.UPDATE});if(!row)throw new NotFoundError('Payslip batch');await row.update({status:'STARTED',data:{...rec(row).data,status:'STARTED',updatedAt:now()}},{transaction:tx});});await this.batchEnqueuer(companyId,actor,id);return {...batch,status:'STARTED',queued:true};}
  async retryFailed(companyId:number,actor:number,id:string) {const batch=await this.getBatch(companyId,id);for(const item of batch.items.filter((row:any)=>row.status==='GENERATION_FAILED')){await this.tenant(companyId,async tx=>{const row=await PayslipBatchItemModel.findOne({where:{companyId,id:item.id},transaction:tx});if(row)await row.update({status:'PENDING',data:{...rec(row).data,status:'PENDING',errorCode:null}},{transaction:tx});});}return this.requestBatchGeneration(companyId,actor,id);}
  async publishBatch(companyId:number,actor:number,id:string) {const batch=await this.getBatch(companyId,id);let published=0;for(const item of batch.items.filter((row:any)=>row.status==='GENERATED')){const payslip=await this.tenant(companyId,tx=>PayslipModel.findOne({where:{companyId,employeeId:item.employeeId,runId:batch.payrollRunId,status:'VALIDATED'},transaction:tx}));if(payslip){await this.publish(companyId,actor,payslip.id);published++;}}return {batch:await this.getBatch(companyId,id),published};}

  async listTemplates(companyId:number) {return this.tenant(companyId,async tx=>(await PayslipTemplateModel.findAll({where:{companyId},order:[['createdAt','DESC']],transaction:tx})).map(rec).map(row=>row.data));}
  async getPolicy(companyId:number) {return this.tenant(companyId,async tx=>{const row=await PayslipPolicyModel.findOne({where:{companyId,status:'ACTIVE'},order:[['createdAt','DESC']],transaction:tx});return row?rec(row).data:{version:0,retentionDays:null,allowWorkerDownload:true,notifyWorkerOnPublish:true,requireManualPublication:true};});}
  async updatePolicy(companyId:number,actor:number,input:{retentionDays:number|null;allowWorkerDownload:boolean;notifyWorkerOnPublish:boolean;requireManualPublication:boolean}) {const data=await this.tenant(companyId,async tx=>{const active=await PayslipPolicyModel.findAll({where:{companyId,status:'ACTIVE'},transaction:tx,lock:tx.LOCK.UPDATE});const version=active.reduce((max,row)=>Math.max(max,Number(rec(row).data.version??0)),0)+1;for(const row of active)await row.update({status:'SUPERSEDED',data:{...rec(row).data,status:'SUPERSEDED',effectiveTo:now()}},{transaction:tx});const id=randomUUID(),createdAt=now(),policy={id,companyId,version,...input,status:'ACTIVE',effectiveFrom:createdAt,effectiveTo:null,updatedBy:actor,createdAt};await PayslipPolicyModel.create({id,companyId,status:'ACTIVE',runId:null,employeeId:null,key:`policy:${version}`,data:policy},{transaction:tx});return policy;});await this.audit.record({companyId,actorUserId:actor,action:'payslips.policy.updated',entityType:'payslip_policy',entityId:data.id,after:{version:data.version,allowWorkerDownload:data.allowWorkerDownload,retentionDays:data.retentionDays}});return data;}
  async createTemplate(companyId:number,actor:number,input:{code:string;name:string;description?:string}) {return this.tenant(companyId,async tx=>{const id=randomUUID(),timestamp=now(),data={id,companyId,...input,status:'DRAFT',createdAt:timestamp,updatedAt:timestamp};await PayslipTemplateModel.create({id,companyId,status:'DRAFT',runId:null,employeeId:null,key:input.code,data},{transaction:tx});await this.audit.record({companyId,actorUserId:actor,action:'payslips.template.created',entityType:'payslip_template',entityId:id,after:{code:input.code}});return data;});}
  async getTemplate(companyId:number,id:string) {return this.tenant(companyId,async tx=>{const row=await PayslipTemplateModel.findOne({where:{companyId,id},transaction:tx});if(!row)throw new NotFoundError('Payslip template');const versions=await PayslipTemplateVersionModel.findAll({where:{companyId,employeeId:id},transaction:tx});return {...rec(row).data,versions:versions.map(rec).map(version=>version.data)};});}
  async createTemplateVersion(companyId:number,actor:number,input:{templateId:string;version:string;layoutConfig:Record<string,unknown>;logoUrl?:string}) {return this.tenant(companyId,async tx=>{const template=await PayslipTemplateModel.findOne({where:{companyId,id:input.templateId},transaction:tx});if(!template)throw new NotFoundError('Payslip template');const id=randomUUID(),timestamp=now(),data={id,companyId,templateId:input.templateId,version:input.version,layoutConfig:input.layoutConfig,logoUrl:input.logoUrl,status:'DRAFT',createdAt:timestamp,updatedAt:timestamp};await PayslipTemplateVersionModel.create({id,companyId,status:'DRAFT',runId:null,employeeId:input.templateId,key:`${input.templateId}:${input.version}`,data},{transaction:tx});return data;});}
  async previewTemplate(companyId:number,templateId:string,version:string) {return this.tenant(companyId,async tx=>{const row=await PayslipTemplateVersionModel.findOne({where:{companyId,employeeId:templateId,key:`${templateId}:${version}`},transaction:tx});if(!row)throw new NotFoundError('Payslip template preview');return rec(row).data;});}
  async publishTemplateVersion(companyId:number,actor:number,id:string) {return this.tenant(companyId,async tx=>{const row=await PayslipTemplateVersionModel.findOne({where:{companyId,id},transaction:tx,lock:tx.LOCK.UPDATE});if(!row)throw new NotFoundError('Payslip template version');const data={...rec(row).data,status:'PUBLISHED',updatedAt:now()};await row.update({status:'PUBLISHED',data},{transaction:tx});if(row.employeeId){const template=await PayslipTemplateModel.findOne({where:{companyId,id:row.employeeId},transaction:tx});if(template)await template.update({status:'PUBLISHED',data:{...rec(template).data,status:'PUBLISHED',updatedAt:now()}},{transaction:tx});}await this.audit.record({companyId,actorUserId:actor,action:'payslips.template.version-published',entityType:'payslip_template_version',entityId:id,after:{status:'PUBLISHED'}});return data;});}

  async createCorrection(companyId:number,actor:number,originalId:string,input:{reason:string;payrollRunId:string;payrollResultId:string;templateVersionId:string}) {
    if(!input.reason.trim())throw new ValidationError('Correction reason is required.');
    const original=await this.tenant(companyId,tx=>this.findPayslip(companyId,originalId,tx));
    const correctionRun=await this.tenant(companyId,async tx=>PayrollRunModel.findOne({where:{companyId,id:input.payrollRunId,status:'CLOSED'},transaction:tx}));
    if(!correctionRun||correctionRun.runType!=='CORRECTION'||correctionRun.get('originalRunId')!==original.data.payrollRunId)throw new ConflictError('A rectification must use a closed CORRECTION payroll run linked to the original run.');
    const correctionPayslip=await this.generate(companyId,actor,{payrollRunId:input.payrollRunId,payrollResultId:input.payrollResultId,employeeId:original.employeeId!,templateVersionId:input.templateVersionId,type:'CORRECTION'});
    return this.tenant(companyId,async tx=>{const generated=await PayslipModel.findOne({where:{companyId,id:correctionPayslip.id},transaction:tx,lock:tx.LOCK.UPDATE});if(!generated)throw new NotFoundError('Correction payslip');await generated.update({data:{...rec(generated).data,originalPayslipId:originalId,correctionReason:input.reason.trim()}},{transaction:tx});const existing=await PayslipCorrectionModel.findOne({where:{companyId,key:`${originalId}:${correctionPayslip.id}`},transaction:tx});if(existing)return rec(existing).data;const id=randomUUID(),data={id,companyId,originalPayslipId:originalId,correctionPayslipId:correctionPayslip.id,reason:input.reason.trim(),createdAt:now()};await PayslipCorrectionModel.create({id,companyId,status:'ACTIVE',runId:input.payrollRunId,employeeId:original.employeeId,key:`${originalId}:${correctionPayslip.id}`,data},{transaction:tx});await this.audit.record({companyId,actorUserId:actor,action:'payslips.correction.created',entityType:'payslip_correction',entityId:id,after:{originalPayslipId:originalId,correctionPayslipId:correctionPayslip.id}});return data;});
  }
  async getCorrections(companyId:number,id:string) {return this.tenant(companyId,async tx=>(await PayslipCorrectionModel.findAll({where:{companyId,key:{[Op.like]:`${id}:%`}},transaction:tx})).map(rec).map(row=>row.data));}
  async duplicateCopy(companyId:number,actor:number,id:string) {const original=await this.tenant(companyId,tx=>this.findPayslip(companyId,id,tx));if(!['VALIDATED','PUBLISHED','SUPERSEDED','ARCHIVED'].includes(original.status))throw new ConflictError('Only an issued payslip can have a duplicate copy.');const source=await this.storage.read(original.data.documentStorageKey);if(createHash('sha256').update(source).digest('hex')!==original.data.documentHash)throw new ConflictError('Original document integrity check failed.');const copyId=randomUUID(),code=randomBytes(12).toString('hex').toUpperCase(),number=`${original.data.number}-2VIA`,issuedAt=now();const bytes=this.renderer.render({...original.data.snapshot,payslipNumber:number,issuedAt,verificationCode:code,template:original.data.templateSnapshot?.layoutConfig??{},copyLabel:'SEGUNDA VIA - DOCUMENTO REPRODUZIDO'});const fileHash=createHash('sha256').update(bytes).digest('hex'),key=await this.storage.put(companyId,copyId,bytes);const data={...original.data,id:copyId,number,type:'DUPLICATE_COPY',status:'VALIDATED',originalPayslipId:id,isDuplicateCopy:true,documentId:copyId,documentStorageKey:key,documentHash:fileHash,verificationCodeHash:createHash('sha256').update(code).digest('hex'),verificationCode:code,createdAt:issuedAt,updatedAt:issuedAt};await this.tenant(companyId,async tx=>{await PayslipModel.create({id:copyId,companyId,status:'VALIDATED',runId:original.runId,employeeId:original.employeeId,key:`duplicate:${id}:${copyId}`,data},{transaction:tx});await PayslipDocumentModel.create({id:randomUUID(),companyId,status:'STORED',runId:original.runId,employeeId:original.employeeId,key:copyId,data:{payslipId:copyId,storageKey:key,mimeType:'application/pdf',fileHash,generatedAt:issuedAt,copyOf:id}},{transaction:tx});});await this.audit.record({companyId,actorUserId:actor,action:'payslips.payslip.duplicate-issued',entityType:'payslip',entityId:copyId,after:{originalPayslipId:id}});return this.present(data);}

  async linkEmployee(companyId:number,actor:number,employeeId:string,userId:number) {return this.tenant(companyId,async tx=>{const employee=await EmployeeModel.findOne({where:{companyId,id:employeeId},transaction:tx});if(!employee)throw new NotFoundError('Employee');const quote=sequelize.getDialect()==='postgres'?'"':'`';const memberships=await sequelize.query(`SELECT id FROM company_members WHERE ${quote}companyId${quote} = :companyId AND ${quote}userId${quote} = :userId AND status = 'ACTIVE' LIMIT 1`,{replacements:{companyId,userId},type:QueryTypes.SELECT,transaction:tx});if(!memberships.length)throw new ValidationError('The user must have an active membership in this company.');const existing=await EmployeeUserLinkModel.findOne({where:{companyId,employeeId,status:'ACTIVE'},transaction:tx});if(existing&&rec(existing).data.userId!==userId)throw new ConflictError('This employee is already linked to another user.');const id=randomUUID();if(existing)return {employeeId,userId};await EmployeeUserLinkModel.create({id,companyId,status:'ACTIVE',runId:null,employeeId,key:String(userId),data:{userId,employeeId,linkedBy:actor,linkedAt:now()}},{transaction:tx});return {employeeId,userId};});}
  private async employeeForUser(companyId:number,userId:number) {return this.tenant(companyId,async tx=>{const links=await EmployeeUserLinkModel.findAll({where:{companyId,status:'ACTIVE'},transaction:tx});const link=links.map(rec).find(row=>row.data.userId===userId);if(!link)throw new ForbiddenError('No employee profile is linked to this user in the selected company.');return String(link.data.employeeId);});}
  async myPayslips(companyId:number,userId:number,query:{page:number;limit:number;status?:string}) {const employeeId=await this.employeeForUser(companyId,userId);return this.tenant(companyId,async tx=>{const where={companyId,employeeId,status:'PUBLISHED'};const total=await PayslipModel.count({where,transaction:tx});const rows=await PayslipModel.findAll({where,order:[['createdAt','DESC']],limit:query.limit,offset:(query.page-1)*query.limit,transaction:tx});return {page:query.page,limit:query.limit,total,data:rows.map(rec).map(row=>this.present(row.data))};});}
  async myPayslip(companyId:number,userId:number,id:string) {const employeeId=await this.employeeForUser(companyId,userId);const row=await this.tenant(companyId,async tx=>{const payslip=await PayslipModel.findOne({where:{companyId,id,employeeId},transaction:tx});if(!payslip||payslip.status!=='PUBLISHED')throw new NotFoundError('My payslip');return rec(payslip);});await this.logAccess(companyId,id,userId,'VIEW');return this.present(row.data);}
  async myDownload(companyId:number,userId:number,id:string) {const policy=await this.getPolicy(companyId);if(!policy.allowWorkerDownload)throw new ForbiddenError('Worker downloads are disabled by company policy.');await this.myPayslip(companyId,userId,id);return this.download(companyId,id,userId);}
  async logAccess(companyId:number,id:string,actorUserId:number,action:string) {await this.tenant(companyId,async tx=>{await PayslipAccessLogModel.create({id:randomUUID(),companyId,status:'ACTIVE',runId:null,employeeId:null,key:id,data:{payslipId:id,actorId:actorUserId,action,accessedAt:now()}},{transaction:tx});});}
  async reportSummary(companyId:number) {return this.tenant(companyId,async tx=>{const rows=(await PayslipModel.findAll({where:{companyId},transaction:tx})).map(rec);return {totalGenerated:rows.filter(row=>['GENERATED','VALIDATED','PUBLISHED','SUPERSEDED','ARCHIVED'].includes(row.status)).length,published:rows.filter(row=>row.status==='PUBLISHED').length,pending:rows.filter(row=>['PENDING','GENERATING'].includes(row.status)).length,failed:rows.filter(row=>['GENERATION_FAILED','PUBLICATION_FAILED'].includes(row.status)).length};});}
  async exportReport(companyId:number,actor:number,input:{format:'PDF'|'CSV'|'XLSX';reportType:'summary'|'emissions'|'pending'|'failed'|'publication'}) {
    const records=await this.tenant(companyId,async tx=>(await PayslipModel.findAll({where:{companyId},order:[['createdAt','DESC']],transaction:tx})).map(rec).map(row=>row.data));
    const filtered=records.filter(row=>input.reportType==='pending'?['PENDING','GENERATING'].includes(row.status):input.reportType==='failed'?['GENERATION_FAILED','PUBLICATION_FAILED'].includes(row.status):input.reportType==='publication'?['PUBLISHED','SUPERSEDED','ARCHIVED'].includes(row.status):true);
    const rows=[['Recibo','Codigo trabalhador','Trabalhador','Periodo inicial','Periodo final','Tipo','Estado','Bruto','Descontos','Liquido','Moeda','Emitido em'],...filtered.map(row=>[row.number,row.snapshot?.employee?.employeeCode,row.snapshot?.employee?.fullName,row.snapshot?.period?.startDate,row.snapshot?.period?.endDate,row.type,row.status,row.grossAmount,row.totalDeductions,row.netAmount,row.currency,row.createdAt].map(value=>String(value??'')))];
    const safe=(value:string)=>/^[=+@\-]/.test(value)?`'${value}`:value;
    const date=now().slice(0,10),base=`payslips-${input.reportType}-${date}`;
    let file:Buffer,mimeType:string,name:string;
    if(input.format==='XLSX'){file=payrollXlsx(rows.map(row=>row.map(safe)));mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';name=`${base}.xlsx`;}
    else if(input.format==='PDF'){file=payrollPdf(rows.map(row=>row.map(safe)));mimeType='application/pdf';name=`${base}.pdf`;}
    else {const csv=rows.map(row=>row.map(value=>`"${safe(value).replace(/"/g,'""')}"`).join(',')).join('\r\n');file=Buffer.from(`\uFEFF${csv}`,'utf8');mimeType='text/csv; charset=utf-8';name=`${base}.csv`;}
    const reportId=randomUUID();await this.audit.record({companyId,actorUserId:actor,action:'payslips.report.exported',entityType:'payslip_report',entityId:reportId,after:{format:input.format,reportType:input.reportType,rows:filtered.length}});
    return {file,mimeType,name,rows:filtered.length};
  }
}
