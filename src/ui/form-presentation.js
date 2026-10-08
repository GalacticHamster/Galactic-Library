export function labeledControl(label,control){
  const wrapper=document.createElement('label');wrapper.className='form-field';wrapper.append(label,control);return wrapper;
}
export function presentAction(button){
  const title=button.textContent;
  if(/^(Delete|Dismiss|Clear saved lookup queue)/u.test(title))button.classList.add('danger');
  else if(/^(Preview|Parse|Inspect|Review|Open |Undo|Next|Previous|Cancel|Clear selection|Clear search|Remove$|Use |Replace draft|Move |Select this page|Refresh receipt)/u.test(title))button.classList.add('secondary');
  return button;
}
