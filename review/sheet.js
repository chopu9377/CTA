const paper = document.getElementById('paper');
const blank = document.getElementById('blank');
blank.onclick = () => {
  const on = paper.classList.toggle('blanks');
  blank.setAttribute('aria-pressed', on);
  paper.querySelectorAll('.shown').forEach(n => n.classList.remove('shown'));
};
paper.addEventListener('click', e => {
  const n = e.target.closest('strong');
  if (n && paper.classList.contains('blanks')) n.classList.toggle('shown');
});
// 아티팩트 안에서는 인쇄 창이 막혀 있어서 로컬 파일로 열었을 때만 버튼을 보인다
if (window.self === window.top) {
  const p = document.getElementById('print');
  p.hidden = false;
  p.onclick = () => window.print();
}
