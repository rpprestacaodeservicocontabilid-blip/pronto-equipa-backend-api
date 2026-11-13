import { NextFunction, Request, Response, Router } from 'express';
import { ReportsController } from '../controllers/reports.controller';
import { REPORT_PERMISSION, REPORT_CATALOG } from '../../domain/report-catalog';
import { ReportsApplicationService } from '../../application/reports-application.service';
import { idSchema } from '../schemas/reports.schema';

type RequirePermission=(permission:string)=>(req:Request,res:Response,next:NextFunction)=>void;
const validateId=(req:Request,res:Response,next:NextFunction)=>{const parsed=idSchema.safeParse(req.params.id);if(!parsed.success){res.status(400).json({success:false,message:'Invalid id.'});return;}next();};
export const createReportsRoutes=(controller:ReportsController,service:ReportsApplicationService,requirePermission:RequirePermission)=>{
  const router=Router();
  const checkCode=(param:'body'|'param')=>(req:Request,res:Response,next:NextFunction)=>{
    const code=param==='body'?String(req.body?.code||''):String(req.params.code||'');
    const def=REPORT_CATALOG.find(item=>item.code===code);if(!def){res.status(404).json({success:false,message:'Relatório não encontrado.'});return;}
    const middleware=requirePermission(REPORT_PERMISSION[def.domain]);
    middleware(req,res,(error?:unknown)=>{if(error){next(error);return;}if(def.domain==='payroll'||def.domain==='tax'){requirePermission('reports:salary:read')(req,res,()=>requirePermission('reports:salary:read-sensitive')(req,res,next));}else next();});
  };
  router.get('/catalog',requirePermission('reports:catalog:read'),controller.catalog.bind(controller));
  router.get('/categories',requirePermission('reports:catalog:read'),controller.categories.bind(controller));
  router.get('/catalog/:code/parameters',requirePermission('reports:catalog:read'),checkCode('param'),controller.parameters.bind(controller));
  router.get('/catalog/:code',requirePermission('reports:catalog:read'),checkCode('param'),(req,res)=>res.json({success:true,data:service.definition(req.params.code)}));
  router.post('/executions',requirePermission('reports:execute'),checkCode('body'),controller.execute.bind(controller));
  router.get('/executions',requirePermission('reports:executions:read'),controller.executions.bind(controller));
  router.get('/executions/:id',requirePermission('reports:executions:read'),validateId,controller.execution.bind(controller));
  router.get('/executions/:id/results',requirePermission('reports:executions:read'),validateId,controller.execution.bind(controller));
  router.get('/executions/:id/progress',requirePermission('reports:executions:read'),validateId,controller.execution.bind(controller));
  router.post('/exports',requirePermission('reports:exports:create'),checkCode('body'),controller.export.bind(controller));
  router.get('/exports',requirePermission('reports:history:read'),controller.exports.bind(controller));
  router.get('/exports/:id/download',requirePermission('reports:exports:download'),validateId,controller.download.bind(controller));
  router.get('/dashboard',requirePermission('reports:dashboard:read'),requirePermission('reports:kpis:read'),requirePermission('reports:hr:read'),requirePermission('reports:payroll:read'),requirePermission('reports:salary:read'),requirePermission('reports:salary:read-sensitive'),controller.dashboard.bind(controller));
  router.get('/custom',requirePermission('reports:catalog:read'),controller.customReports.bind(controller));
  router.post('/custom',requirePermission('reports:custom:create'),checkCode('body'),controller.customReports.bind(controller));
  router.post('/custom/:id/preview',requirePermission('reports:custom:update'),validateId,controller.previewCustomReport.bind(controller));
  router.post('/custom/:id/publish',requirePermission('reports:custom:publish'),validateId,controller.publishCustomReport.bind(controller));
  router.get('/schedules',requirePermission('reports:history:read'),controller.schedules.bind(controller));
  router.post('/schedules',requirePermission('reports:schedules:create'),checkCode('body'),controller.schedules.bind(controller));
  router.post('/schedules/:id/:action(pause|resume)',requirePermission('reports:schedules:update'),validateId,controller.scheduleAction.bind(controller));
  return router;
};



