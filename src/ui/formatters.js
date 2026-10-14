// Generated UI captions only. Never normalize stored titles, evidence or parser inputs.
export const providerLabel=id=>({steam:'Steam',gog:'GOG',epic:'Epic',kindle:'Kindle',audible:'Audible',kobo:'Kobo',humble:'Humble Bundle',fanatical:'Fanatical','amazon-games':'Amazon Games','amazon-video':'Amazon Video','fandango-at-home':'Fandango at Home'}[id]??id);
export const mediaLabel=id=>({book:'Book',audiobook:'Audiobook',game:'Game',software:'Software',movie:'Movie',tv:'TV show'}[id]??id);
export const accountLabel=(record,db)=>`${providerLabel(record.provider)} — ${db.providerProfiles?.[record.profileId]?.nickname||'Unnamed account'}`;
export const accessLabel=value=>({owned:'Owned',claimed:'Permanently claimed',borrowed:'Borrowed',subscription:'Subscription access',rental:'Rented',unknown:'Ownership unconfirmed',returned:'Returned / Refunded',revoked:'Access revoked',expired:'Access expired'}[value]??'Access unconfirmed');
export const readingAccessLabel=value=>({unknown:'Access not checked',accessible:'Accessible',unavailable:'Unavailable'}[value]??'Access not checked');
export const countLabel=(count,singular,plural=singular+'s')=>`${count} ${count===1?singular:plural}`;
export const rangeLabel=(first,last)=>`${first}–${last}`;
export function formatDate(value,{time=true,locale}={}){
  if(!value)return 'Not recorded';
  const dateOnly=/^(\d{4})-(\d{2})-(\d{2})$/u.exec(String(value));
  if(dateOnly){const [,y,m,d]=dateOnly,date=new Date(Number(y),Number(m)-1,Number(d),12);if(date.getFullYear()!==Number(y)||date.getMonth()!==Number(m)-1||date.getDate()!==Number(d))return 'Invalid date';return date.toLocaleDateString(locale,{year:'numeric',month:'short',day:'numeric'});}
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return 'Not recorded';
  return time?date.toLocaleString(locale):date.toLocaleDateString(locale);
}
