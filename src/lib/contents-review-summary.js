import {contentsStatement,contentsReviewChanged,reviewSeriesAnchor} from './contents.js';

// Presentation and optional manual drafts only. Never feeds automatic coverage.
export function relativeContentsDraft(record,statement){
  const match=/^(?:collects?|collecting|includes?)\s+the first (one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,3}) issues of (?:this|the) (?:(?:hit|acclaimed|classic|original|seminal|ongoing)\s+)*series[.!]?$/iu.exec(statement.trim());
  if(!match)return null;
  const words=['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
  const count=Number(match[1])||words.indexOf(match[1].toLowerCase())+1;
  if(count<1||count>499)return null;
  const anchor=reviewSeriesAnchor(record.title,{series:record.metadata?.series,allowTitleBinding:true});
  return {count,text:anchor?`${anchor.series} #1-${count}`:'',series:anchor?.series??''};
}

export function contentsReviewSummary(record,proposal,review){
  const statement=proposal?.manifestEvidence||contentsStatement(record);
  const count=proposal?.entries?.length??0;
  const relative=relativeContentsDraft(record,statement);
  const changed=Boolean(review&&contentsReviewChanged(record,review));
  if(changed)return {kind:'changed',statement,relative,summary:'The captured description changed after your review. Your saved entries remain unchanged. Compare the description with your reviewed list before replacing it.'};
  if(review)return {kind:'reviewed',statement,relative,summary:review.status==='rejected'?'Contents rejected. These suggestions are excluded from coverage. You can save corrected entries or undo the rejection.':`${review.entries.length} reviewed entries saved. You can correct the list or undo the review.`};
  if(count)return {kind:'suggestions',statement,relative,summary:`${count} suggested entries to check. ${proposal.unparsed?.length?'Some source text still needs interpretation. ':''}Confirm the list if it is correct, or edit it before saving. Review is optional; eligible inferred issues may already contribute to coverage.`};
  if(relative)return {kind:'information',statement,relative,summary:`The description says this book collects ${relative.count} issues, but GL hasn't identified their issue numbers.${relative.series?' A possible interpretation uses the series named in this book\'s title or metadata. Preview and check it before adding.':' It does not establish one comic series. Enter the series and issue numbers from a source you have checked.'}`};
  if(statement)return {kind:'information',statement,relative,summary:proposal?.outcome==='filtered'?'This description does not identify included comic issues. No suggestion is waiting for confirmation. Enter contents only if you have a source that lists them.':'The description is saved, but GL could not identify an issue list. No suggestion is waiting for confirmation. You can enter the series and issue numbers from a source you have checked.'};
  return {kind:'information',statement:'',relative:null,summary:'No usable contents description is saved. There is nothing to confirm. You can enter contents from a source you have checked.'};
}
