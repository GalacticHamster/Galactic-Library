import {checkIndependentEvidence} from './kindle-independent-evidence-fixture.js';
const checks=[];
try{
  const fixtures=await(await fetch('/tests/fixtures/kindle/kindle-independent-evidence.json')).json();
  checks.push(...await checkIndependentEvidence(fixtures,{ui:true,deferToggle:new URLSearchParams(location.search).has('defer-editor-toggle')}));
  await fetch('/test-result',{method:'POST',body:JSON.stringify({checks})});
}catch(error){await fetch('/test-result',{method:'POST',body:JSON.stringify({checks,error:error.message,stack:error.stack})});}
