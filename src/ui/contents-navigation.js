const recordReference=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
export function bookRoute(hash) {
  const match=/^#(contents|library)\?record=([^&]+)$/u.exec(String(hash??''));
  return match&&recordReference.test(match[2])?{workspace:match[1],recordRef:match[2]}:null;
}
export function bookHref(workspace,recordRef) {
  if(!['contents','library'].includes(workspace)||!recordReference.test(recordRef))throw Error('Invalid book destination.');
  return `#${workspace}?record=${recordRef}`;
}
