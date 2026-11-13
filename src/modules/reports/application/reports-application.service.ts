import { Op, QueryTypes, WhereOptions } from 'sequelize';
import { randomUUID } from 'crypto';
import { sequelize } from '../../../infra/database';
import { EmployeeModel } from '../../employees/infrastructure/persistence/model/employee.model';
import { EmploymentContractModel } from '../../contracts/infrastructure/persistence/model/employment-contract.model';
import { AttendanceRecordModel } from '../../attendance/infrastructure/persistence/model/attendance-record.model';
import { LeaveRequestModel } from '../../leave/infrastructure/persistence/model/leave-request.model';
import { PayrollRunModel, PayrollEmployeeResultModel, PayrollPeriodModel } from '../../payroll/infrastructure/payroll.models';
import { PayrollPaymentInstructionModel, PayrollPaymentTransactionModel, PayrollPaymentReturnModel } from '../../payments/infrastructure/payment.models';
import { EmployeeLoanModel } from '../../loans/infrastructure/persistence/model/employee-loan.model';
import { PayslipModel, PayslipPublicationModel, PayslipDeliveryModel } from '../../payslips/infrastructure/payslips.models';
import { REPORT_CATALOG, REPORT_PERMISSION, ReportDefinition } from '../domain/report-catalog';
import { ReportsRecordModel } from '../infrastructure/reports.models';
import { payrollPdf, payrollXlsx } from '../../payroll/infrastructure/payroll-export';
import { SequelizeMembershipReader } from '../../tenancy/infrastructure/persistence/readers/sequelize-membership.reader';

export interface ReportFilters { from?: string; to?: string; employeeId?: string; departmentId?: number; status?: string; limit?: number; }
export class ReportsApplicationService {
  constructor(private readonly audit: { record(input: any): Promise<void> }) {}

  catalog() { return REPORT_CATALOG.map(({code,name,description,domain,sensitive}) => ({code,name,description,domain,sensitive})); }
  categories() { return [...new Set(REPORT_CATALOG.map(item=>item.domain))].map(code=>({code,name:code.toUpperCase(),reports:REPORT_CATALOG.filter(item=>item.domain===code).length})); }
  parameters(code:string) { const report=this.definition(code); return {code,filters:['from','to','employeeId','departmentId','status','limit'],maxRows:5000,defaultRows:1000,sensitive:report.sensitive===true}; }
  definition(code: string): ReportDefinition {
    const value = REPORT_CATALOG.find(item => item.code === code);
    if (!value) throw Object.assign(new Error('Relatório não encontrado.'), { statusCode: 404 });
    return value;
  }
  async execute(companyId: number, actorUserId: number, code: string, filters: ReportFilters) {
    const definition = this.definition(code);
    const data = await this.readSource(companyId, definition, filters);
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const payload = { filters, rowCount: data.length, data, generatedAt: createdAt, definitionVersion: 1 };
    await this.recordCreate(companyId, { id, companyId, recordType: 'EXECUTION', status: 'COMPLETED', ownerUserId: actorUserId, code, payload, createdAt: new Date(createdAt), updatedAt: new Date(createdAt) });
    await this.audit.record({ companyId, actorUserId, action: 'REPORT_EXECUTED', entityType: 'REPORT_EXECUTION', entityId: id, after: { code, rowCount: data.length, filters } });
    return { id, code, status: 'COMPLETED', rowCount: data.length, generatedAt: createdAt, data };
  }
  async listExecutions(companyId: number, actorUserId: number, limit = 30) {
    const rows = await this.recordFindAll(companyId, { where: { companyId, recordType: 'EXECUTION', ownerUserId: actorUserId }, order: [['createdAt','DESC']], limit: Math.min(limit,100) });
    return rows.map(row => ({ id: row.id, code: row.code, status: row.status, rowCount: row.payload.rowCount, generatedAt: row.createdAt }));
  }
  async listExports(companyId:number,actorUserId:number,limit=30) { const rows=await this.recordFindAll(companyId,{where:{companyId,recordType:'EXPORT',ownerUserId:actorUserId},order:[['createdAt','DESC']],limit:Math.min(limit,100)}); return rows.map(row=>({id:row.id,code:row.code,status:row.status,filename:row.payload.filename,rowCount:row.payload.rowCount,createdAt:row.createdAt})); }
  async getExecution(companyId: number, actorUserId: number, id: string) {
    const row = await this.recordFindOne(companyId, { where: { id, companyId, ownerUserId: actorUserId, recordType: 'EXECUTION' } });
    if (!row) throw Object.assign(new Error('Execução não encontrada.'), { statusCode: 404 });
    await this.audit.record({companyId,actorUserId,action:'REPORT_RESULT_READ',entityType:'REPORT_EXECUTION',entityId:id,after:{code:row.code}});
    return { id: row.id, code: row.code, status: row.status, ...row.payload };
  }
  async createExport(companyId: number, actorUserId: number, code: string, format: 'CSV'|'XLSX'|'PDF', filters: ReportFilters) {
    const result = await this.execute(companyId, actorUserId, code, filters);
    const rows = result.data as any[];
    const keys = rows.length ? Object.keys(rows[0]) : [];
    const table = [keys, ...rows.map(row => keys.map(key => typeof row[key] === 'object' ? JSON.stringify(row[key] ?? '') : String(row[key] ?? '')))];
    const content = format === 'PDF' ? payrollPdf(table) : format === 'XLSX' ? payrollXlsx(table) : Buffer.from(this.toCsv(rows));
    const filename = `${code.toLowerCase()}-${new Date().toISOString().slice(0,10)}.${format.toLowerCase()}`;
    const createdAt = new Date();
    const row = await this.recordCreate(companyId, { id: randomUUID(), companyId, recordType: 'EXPORT', status: 'READY', ownerUserId: actorUserId, code, payload: { filename, format, content: content.toString('base64'), rowCount: result.rowCount, executionId: result.id }, createdAt, updatedAt: createdAt });
    await this.audit.record({ companyId, actorUserId, action: 'REPORT_EXPORTED', entityType: 'REPORT_EXPORT', entityId: row.id, after: { code, format, rowCount: result.rowCount } });
    return { id: row.id, filename, rowCount: result.rowCount, status: 'READY' };
  }
  async downloadExport(companyId: number, actorUserId: number, id: string) {
    const row = await this.recordFindOne(companyId, { where: { id, companyId, ownerUserId: actorUserId, recordType: 'EXPORT', status: 'READY' } });
    if (!row) throw Object.assign(new Error('Exportação não encontrada.'), { statusCode: 404 });
    const content = String(row.payload.content || '');
    await this.audit.record({ companyId, actorUserId, action: 'REPORT_EXPORT_DOWNLOADED', entityType: 'REPORT_EXPORT', entityId: id, after: { code: row.code } });
    return { filename: String(row.payload.filename), format: String(row.payload.format || 'CSV'), content: Buffer.from(content, 'base64') };
  }
  async dashboard(companyId: number, filters: ReportFilters) {
    const active = await this.withTenant(companyId, async transaction => EmployeeModel.count({ where: { companyId, status: 'ACTIVE' }, transaction }));
    const employees = await this.withTenant(companyId, async transaction => EmployeeModel.count({ where: { companyId }, transaction }));
    const payroll = await this.withTenant(companyId, transaction => this.readPayroll(companyId, { ...filters, limit: 5000 }, transaction));
    const gross = payroll.reduce((n, r:any) => n + Number(r.grossAmount || 0), 0);
    const net = payroll.reduce((n, r:any) => n + Number(r.netAmount || 0), 0);
    const costs = payroll.reduce((n, r:any) => n + Number(r.employerCostsAmount || 0), 0);
    return { asOf: new Date().toISOString(), currency: 'AOA', workforce: { active, total: employees }, payroll: { grossAmount: gross, netAmount: net, employerCostsAmount: costs, currency: payroll[0]?.currency || 'AOA', closedResults: payroll.length }, formulas: { personnelCost: 'grossAmount + employerCostsAmount', source: 'closed payroll results only' } };
  }
  async saveCustomReport(companyId: number, actorUserId: number, input: { name: string; code: string; fields: string[]; filters?: Record<string,unknown> }) {
    const definition = this.definition(input.code);
    const allowed = this.allowedFields(definition);
    if (!input.fields.length || input.fields.some(field => !allowed.includes(field))) throw Object.assign(new Error('O relatório contém campos não permitidos.'), { statusCode: 400 });
    const createdAt = new Date();
    const record = await this.recordCreate(companyId, { id: randomUUID(), companyId, recordType: 'CUSTOM_REPORT', status: 'DRAFT', ownerUserId: actorUserId, code: input.code, payload: { name: input.name, fields: input.fields, filters: input.filters || {}, version: 1 }, createdAt, updatedAt: createdAt });
    return { id: record.id, ...record.payload, status: record.status };
  }
  async previewCustomReport(companyId:number,actorUserId:number,id:string,filters:ReportFilters) { const row=await this.recordFindOne(companyId,{where:{id,companyId,recordType:'CUSTOM_REPORT',ownerUserId:actorUserId}}); if(!row)throw Object.assign(new Error('Relatório personalizado não encontrado.'),{statusCode:404}); const definition=this.definition(String(row.code)); const data=await this.readSource(companyId,definition,filters); const fields=Array.isArray(row.payload.fields)?row.payload.fields as string[]:[]; return {id,code:row.code,version:row.payload.version,rowCount:data.length,data:data.map(item=>Object.fromEntries(fields.map(field=>[field,item[field]])))}; }
  async listCustomReports(companyId: number, actorUserId: number) {
    const rows = await this.recordFindAll(companyId, { where: { companyId, recordType: 'CUSTOM_REPORT', ownerUserId: actorUserId }, order: [['updatedAt','DESC']] });
    return rows.map(row => ({ id: row.id, status: row.status, ...row.payload }));
  }
  async publishCustomReport(companyId: number, actorUserId: number, id: string) {
    const row = await this.recordFindOne(companyId, { where: { id, companyId, recordType: 'CUSTOM_REPORT', ownerUserId: actorUserId } });
    if (!row) throw Object.assign(new Error('Relatório personalizado não encontrado.'), { statusCode: 404 });
    const payload={...row.payload,publishedAt:new Date().toISOString(),version:Number(row.payload.version||1)+1};
    await this.withTenant(companyId,async transaction=>{const current=await ReportsRecordModel.findOne({where:{id,companyId,recordType:'CUSTOM_REPORT',ownerUserId:actorUserId},transaction});if(current)await current.update({status:'PUBLISHED',payload},{transaction});});
    return { id, status: row.status, ...row.payload };
  }
  async createSchedule(companyId:number,actorUserId:number,input:{code:string;cron:string;timezone:string;format:'CSV'|'XLSX'|'PDF';filters?:ReportFilters;recipients?:number[]}) {
    const definition=this.definition(input.code);
    if (!/^(\S+\s+){4}\S+$/.test(input.cron)) throw Object.assign(new Error('Expressão cron inválida.'),{statusCode:400});
    try { Intl.DateTimeFormat('en-US',{timeZone:input.timezone}); } catch { throw Object.assign(new Error('Fuso horário inválido.'),{statusCode:400}); }
    const reader=new SequelizeMembershipReader();
    for(const recipient of input.recipients||[]){const [membership,permissions]=await Promise.all([reader.findMembership(companyId,recipient),reader.findPermissionNames(companyId,recipient)]);const permission=REPORT_PERMISSION[definition.domain];if(!membership||membership.memberStatus!=='ACTIVE'||membership.companyStatus!=='ACTIVE'||!permissions.includes(permission)||((definition.domain==='payroll'||definition.domain==='tax')&&(!permissions.includes('reports:salary:read')||!permissions.includes('reports:salary:read-sensitive'))))throw Object.assign(new Error('Recipient is not authorized for this report.'),{statusCode:403});}
    const createdAt=new Date();
    const row=await this.recordCreate(companyId, {id:randomUUID(),companyId,recordType:'SCHEDULE',status:'ACTIVE',ownerUserId:actorUserId,code:input.code,payload:{...input,recipients:input.recipients||[],createdBy:actorUserId},createdAt,updatedAt:createdAt});
    return {id:row.id,status:row.status,...row.payload};
  }
  async schedules(companyId:number,actorUserId:number) {
    const rows=await this.recordFindAll(companyId, {where:{companyId,recordType:'SCHEDULE',ownerUserId:actorUserId},order:[['createdAt','DESC']]});
    return rows.map(row=>({id:row.id,status:row.status,...row.payload}));
  }
  async updateSchedule(companyId:number,actorUserId:number,id:string,action:'pause'|'resume') {
    const row=await this.recordFindOne(companyId, {where:{companyId,id,recordType:'SCHEDULE',ownerUserId:actorUserId}});
    if(!row)throw Object.assign(new Error('Agendamento não encontrado.'),{statusCode:404});
    const status=action==='pause'?'PAUSED':'ACTIVE';
    await this.withTenant(companyId,async transaction=>{const current=await ReportsRecordModel.findOne({where:{companyId,id,recordType:'SCHEDULE',ownerUserId:actorUserId},transaction});if(current)await current.update({status},{transaction});});
    return {id,status,...row.payload};
  }

  private recordCreate(companyId:number, values:any) { return this.withTenant(companyId, transaction => ReportsRecordModel.create(values,{transaction})); }
  private recordFindAll(companyId:number, options:any) { return this.withTenant(companyId, transaction => ReportsRecordModel.findAll({...options,transaction})); }
  private recordFindOne(companyId:number, options:any) { return this.withTenant(companyId, transaction => ReportsRecordModel.findOne({...options,transaction})); }

  private async readSource(companyId: number, report: ReportDefinition, filters: ReportFilters): Promise<any[]> {
    const limit = Math.max(1, Math.min(Number(filters.limit || 1000), 5000));
    return this.withTenant(companyId, async transaction => {
      const departmentEmployees = filters.departmentId ? await EmployeeModel.findAll({where:{companyId,departmentId:filters.departmentId},attributes:['id'],transaction}) : null;
      const departmentEmployeeIds = departmentEmployees?.map(employee=>employee.id) || null;
      const whereFor = (field?: string): WhereOptions => {
        const where: any = { companyId };
        if (filters.employeeId) where.employeeId = filters.employeeId;
        if (departmentEmployeeIds) where.employeeId = filters.employeeId ? (departmentEmployeeIds.includes(filters.employeeId) ? filters.employeeId : '00000000-0000-0000-0000-000000000000') : { [Op.in]: departmentEmployeeIds };
        if (field && filters.from) where[field] = { ...(where[field] || {}), [Op.gte]: filters.from };
        if (field && filters.to) where[field] = { ...(where[field] || {}), [Op.lte]: filters.to };
        if (filters.status && report.source !== 'payroll') where.status = filters.status;
        return where;
      };
      switch (report.source) {
        case 'employees': {
          const where:any = { companyId };
          if (filters.employeeId) where.id = filters.employeeId;
          if (filters.departmentId) where.departmentId = filters.departmentId;
          if (filters.status) where.status = filters.status;
          const dateField = report.code === 'RPT-HR-004' ? 'terminationDate' : 'admissionDate';
          if (filters.from || filters.to) where[dateField] = { ...(filters.from ? { [Op.gte]: filters.from } : {}), ...(filters.to ? { [Op.lte]: filters.to } : {}) };
          const rows=await EmployeeModel.findAll({where,attributes:['id','employeeNumber','firstName','lastName','admissionDate','terminationDate','departmentId','jobTitle','jobCategory','status'],order:[['lastName','ASC']],limit,transaction});
          return rows.map(r=>r.get({plain:true}));
        }
        case 'contracts': { const rows=await EmploymentContractModel.findAll({where:whereFor('startDate'),attributes:['id','employeeId','contractNumber','typeCode','status','startDate','endDate','currency','salaryAmount'],order:[['startDate','DESC']],limit,transaction}); return rows.map(r=>r.get({plain:true})); }
        case 'attendance': { const rows=await AttendanceRecordModel.findAll({where:whereFor('workDate'),attributes:['id','employeeId','punchType','occurredAt','workDate','source'],order:[['occurredAt','DESC']],limit,transaction}); return rows.map(r=>r.get({plain:true})); }
        case 'leave': { const rows=await LeaveRequestModel.findAll({where:whereFor('startDate'),attributes:['id','employeeId','leaveType','status','requestedDays','startDate','endDate','submittedAt','decidedAt'],order:[['startDate','DESC']],limit,transaction}); return rows.map(r=>r.get({plain:true})); }
        case 'payroll': return this.readPayroll(companyId,filters,transaction);
        case 'payments': {
          const model = report.code === 'RPT-PMT-003' ? PayrollPaymentReturnModel : report.code === 'RPT-PMT-007' ? PayrollPaymentTransactionModel : PayrollPaymentInstructionModel;
          const rows=await model.findAll({where:whereFor('createdAt'),limit,order:[['createdAt','DESC']],transaction});
          return rows.map((r:any)=>{const d=r.get({plain:true}); delete d.beneficiarySnapshot; delete d.accountCiphertext; return d;});
        }
        case 'loans': { const rows=await EmployeeLoanModel.findAll({where:whereFor('createdAt'),attributes:['id','employeeId','loanNumber','principalAmount','currency','status','disbursedAt','createdAt'],limit,order:[['createdAt','DESC']],transaction}); return rows.map(r=>r.get({plain:true})); }
        case 'payslips': {
          const model = report.code==='RPT-PSL-004' ? PayslipDeliveryModel : report.code==='RPT-PSL-006' ? PayslipPublicationModel : PayslipModel;
          const rows=await model.findAll({where:whereFor('createdAt'),attributes:{exclude:['data']},limit,order:[['createdAt','DESC']],transaction});
          return rows.map((r:any)=>{const d=r.get({plain:true}); delete d.data; return d;});
        }
        default: return [];
      }
    });
  }
  private async readPayroll(companyId:number,filters:ReportFilters,transaction?:any):Promise<any[]> {
    const periodWhere:any={companyId};
    if(filters.from||filters.to) periodWhere.startDate={...(filters.from?{[Op.gte]:filters.from}:{}),...(filters.to?{[Op.lte]:filters.to}:{})};
    const periods=await PayrollPeriodModel.findAll({where:periodWhere,attributes:['id'],transaction});
    const periodIds=periods.map(p=>p.id);
    if(!periodIds.length)return [];
    const runs=await PayrollRunModel.findAll({where:{companyId,periodId:{[Op.in]:periodIds},status:'CLOSED'},attributes:['id'],transaction});
    const runIds=runs.map(r=>r.id);
    if(!runIds.length)return [];
    const where:any={companyId,runId:{[Op.in]:runIds}}; if(filters.employeeId)where.employeeId=filters.employeeId; if(filters.departmentId){const employees=await EmployeeModel.findAll({where:{companyId,departmentId:filters.departmentId},attributes:['id'],transaction});const employeeIds=employees.map(employee=>employee.id);if(!employeeIds.length)return [];where.employeeId={[Op.in]:employeeIds};}
    const rows=await PayrollEmployeeResultModel.findAll({where,attributes:['id','runId','employeeId','grossAmount','deductionsAmount','netAmount','employerCostsAmount','currency','calculationSnapshot'],limit:Math.min(Number(filters.limit||1000),5000),transaction});
    return rows.map(r=>r.get({plain:true}));
  }
  private withTenant<T>(companyId:number,fn:(transaction:any)=>Promise<T>):Promise<T> {
    return sequelize.transaction(async transaction=>{
      if(sequelize.getDialect()==='postgres') await sequelize.query("SELECT set_config('app.current_tenant', :tenant, true)",{replacements:{tenant:String(companyId)},type:QueryTypes.SELECT,transaction});
      return fn(transaction);
    });
  }
  private allowedFields(report:ReportDefinition):string[] {
    const fields:Record<string,string[]>={employees:['employeeNumber','firstName','lastName','admissionDate','terminationDate','departmentId','jobTitle','jobCategory','status'],contracts:['employeeId','contractNumber','typeCode','status','startDate','endDate','currency'],attendance:['employeeId','punchType','occurredAt','workDate','source'],leave:['employeeId','leaveType','status','requestedDays','startDate','endDate'],payroll:['runId','employeeId','grossAmount','deductionsAmount','netAmount','employerCostsAmount','currency'],payments:['employeeId','amount','currency','paymentType','method','status','createdAt'],loans:['employeeId','loanNumber','principalAmount','currency','status'],payslips:['employeeId','status','createdAt']};
    return fields[report.source] || [];
  }
  private toCsv(rows:any[]):string {
    if(!rows.length)return '\ufeff';
    const keys=Object.keys(rows[0]); const cell=(value:any)=>{let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return `"${text.replace(/"/g,'""')}"`;};
    return '\ufeff'+[keys.map(cell).join(';'),...rows.map(row=>keys.map(key=>cell(typeof row[key]==='object'?JSON.stringify(row[key]):row[key])).join(';'))].join('\r\n');
  }
}













