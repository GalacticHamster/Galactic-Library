import {checkContentsReviewUsability} from './contents-review-usability-browser-fixture.js';
const checks=[];
try{
 await checkContentsReviewUsability((ok,message)=>{if(!ok)throw Error(message);checks.push(message);});
 await fetch('/test-result',{method:'POST',body:JSON.stringify({checks})});
}catch(error){await fetch('/test-result',{method:'POST',body:JSON.stringify({checks,error:error.stack})});}
