import { createHash, createHmac } from 'crypto';
import { PayslipDocumentStorage } from './document-storage.adapter';

const sha256=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const hmac=(key:Buffer|string,value:string)=>createHmac('sha256',key).update(value).digest();

/** Private S3-compatible object storage adapter (AWS S3, MinIO, or another SigV4 endpoint). */
export class S3PayslipStorage implements PayslipDocumentStorage {
  private readonly endpoint:URL;
  private readonly bucket:string;
  private readonly region:string;
  private readonly accessKey:string;
  private readonly secretKey:string;
  constructor(){
    const endpoint=process.env.PAYSLIPS_S3_ENDPOINT,bucket=process.env.PAYSLIPS_S3_BUCKET,accessKey=process.env.PAYSLIPS_S3_ACCESS_KEY,secretKey=process.env.PAYSLIPS_S3_SECRET_KEY;
    if(!endpoint||!bucket||!accessKey||!secretKey)throw new Error('S3 payslip storage requires endpoint, bucket and credentials.');
    this.endpoint=new URL(endpoint);this.bucket=bucket;this.accessKey=accessKey;this.secretKey=secretKey;this.region=process.env.PAYSLIPS_S3_REGION??'us-east-1';
  }
  async put(companyId:number,payslipId:string,bytes:Buffer){const key=`tenants/${companyId}/${payslipId}/${payslipId}.pdf`;await this.request('PUT',key,bytes,'application/pdf');return key;}
  async read(key:string){const response=await this.request('GET',key);return Buffer.from(await response.arrayBuffer());}
  async remove(key:string){await this.request('DELETE',key);}
  private objectUrl(key:string){const path=[this.endpoint.pathname.replace(/\/$/,''),this.bucket,...key.split('/').map(segment=>encodeURIComponent(segment))].filter(Boolean).join('/');const url=new URL(this.endpoint);url.pathname=`/${path}`;url.search='';return url;}
  private async request(method:string,key:string,body?:Buffer,contentType?:string):Promise<Response>{
    const url=this.objectUrl(key),now=new Date(),date=now.toISOString().replace(/[:-]|\.\d{3}/g,''),day=date.slice(0,8),payloadHash=sha256(body??Buffer.alloc(0));
    const headers:Record<string,string>={'x-amz-content-sha256':payloadHash,'x-amz-date':date};if(contentType)headers['content-type']=contentType;
    const canonical:Record<string,string>={...headers,host:url.host},names=Object.keys(canonical).sort();
    const signedHeaders=names.join(';');
    const canonicalHeaders=names.map(name=>`${name}:${canonical[name].trim()}\n`).join('');
    const canonicalRequest=[method,url.pathname,'',canonicalHeaders,signedHeaders,payloadHash].join('\n');
    const scope=`${day}/${this.region}/s3/aws4_request`,stringToSign=`AWS4-HMAC-SHA256\n${date}\n${scope}\n${sha256(canonicalRequest)}`;
    const dateKey=hmac(`AWS4${this.secretKey}`,day),regionKey=hmac(dateKey,this.region),serviceKey=hmac(regionKey,'s3'),signingKey=hmac(serviceKey,'aws4_request');
    const signature=createHmac('sha256',signingKey).update(stringToSign).digest('hex');
    const authorization=`AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const response=await fetch(url,{method,headers:{...headers,Authorization:authorization},...(body?{body:body as any}:{})});
    if(!response.ok&&!(method==='DELETE'&&response.status===404))throw new Error(`Payslip object storage request failed (${response.status}).`);
    return response;
  }
}
