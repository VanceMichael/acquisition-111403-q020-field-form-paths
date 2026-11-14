export async function collect(client) {
 const document=await client("/submission");
 return [{id:document.instanceId+':'+document.revision,...document}];
}
