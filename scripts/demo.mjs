import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startSource} from '../provider/server.mjs';
import {startIntake} from '../src/app.mjs';

const directory=await mkdtemp(join(tmpdir(),'intake-demo-'));
const source=await startSource();
const intake=await startIntake({origin:source.origin,directory});
const collectNow=async()=>{
 const response=await fetch(intake.origin+'/collect',{method:'POST'});
 const body=await response.json();if(!response.ok)throw new Error(JSON.stringify(body));
 return body;
};
const overview=async()=>(await(await fetch(intake.origin+'/overview')).json());
try{
 console.log('第一次接收',JSON.stringify(await collectNow()));
 console.log('当前状态',JSON.stringify((await overview()).instances,null,2));
 source.setPhase('revision');
 console.log('来源修订后再次接收',JSON.stringify(await collectNow()));
 const after=await overview();
 console.log('变化依据',JSON.stringify(after.changes,null,2));
 console.log('修订后状态',JSON.stringify(after.instances,null,2));
}finally{await intake.close();await source.close();await rm(directory,{recursive:true,force:true});}
