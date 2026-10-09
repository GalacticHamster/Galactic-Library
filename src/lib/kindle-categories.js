import {object,text} from './validation.js';

export const KINDLE_BREADCRUMB_SELECTORS=['#wayfinding-breadcrumbs_feature_div','#wayfinding-breadcrumbs_container','[data-feature-name="wayfinding-breadcrumbs"]'];

// Optional bounded source metadata within the existing Kindle enrichment.
// No new database schema version, classification table or migration is needed.
export function validateKindleCategoryPaths(value){
  if(!Array.isArray(value)||value.length>8)throw Error('Kindle category paths must be a bounded list.');
  return value.map(path=>{
    object(path,'Kindle category path');
    if(!KINDLE_BREADCRUMB_SELECTORS.includes(path.selector))throw Error('Invalid Kindle breadcrumb source.');
    if(!Array.isArray(path.nodes)||!path.nodes.length||path.nodes.length>12)throw Error('Invalid Kindle category path length.');
    return {selector:path.selector,nodes:path.nodes.map(node=>{
      object(node,'Kindle category node');const label=text(node.label,200,'Kindle category label'),nodeId=text(node.nodeId,20,'Amazon node ID');
      if(!label||nodeId&&!/^\d{1,20}$/u.test(nodeId))throw Error('Invalid Kindle category node.');
      return {label,nodeId};
    })};
  });
}

/** Identify Kindle container structure, not the third array slot. Partial paths
 * anchored at Kindle eBooks can qualify; reordered roots remain source evidence
 * but do not produce broad filters. Deep retail facets never become filters. */
export function kindleBroadCategory(path){
  const labels=path.nodes.map(node=>node.label.trim().toLocaleLowerCase());
  const store=labels.indexOf('kindle store'),books=labels.indexOf('kindle ebooks');
  if(books<0||store>=0&&(store!==0||books<=store)||store<0&&books!==0)return '';
  const label=path.nodes[books+1]?.label??'';
  if(!label||['kindle store','kindle ebooks','books'].includes(label.toLocaleLowerCase()))return '';
  return label;
}
