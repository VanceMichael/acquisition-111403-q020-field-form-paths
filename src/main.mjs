import {startSource} from '../provider/server.mjs';
import {startIntake} from './app.mjs';

const source=await startSource(Number(process.env.SOURCE_PORT||4011));
const intake=await startIntake({origin:source.origin,directory:process.env.DATA_DIR||'var/archive',port:Number(process.env.PORT||4010)});
console.log(JSON.stringify({message:'资料接收服务启动',source:source.origin,intake:intake.origin}));
let stopping=false;
async function stop(){if(stopping)return;stopping=true;await intake.close();await source.close();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
