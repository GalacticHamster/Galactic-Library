// Pair using runtime.id / Gecko's declared add-on ID, never a moz-extension URL.
export function isExtensionId(value){
  if(typeof value!=='string'||value!==value.trim()||value.length>255)return false;
  return /^[a-p]{32}$/u.test(value)||/^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/iu.test(value)||/^\{[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\}$/iu.test(value);
}
