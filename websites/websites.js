(function(){
  var chips=[].slice.call(document.querySelectorAll('.chip'));
  var cards=[].slice.call(document.querySelectorAll('.card'));
  var q=document.getElementById('q');
  var empty=document.getElementById('empty');
  var filter='all';
  function apply(){
    var term=(q.value||'').trim().toLowerCase();
    var visible=0;
    cards.forEach(function(c){
      var catOk = filter==='all' || (c.getAttribute('data-cat')||'').split(' ').indexOf(filter)>-1;
      var text=(c.textContent+' '+(c.getAttribute('data-search')||'')).toLowerCase();
      var qOk = !term || text.indexOf(term)>-1;
      var show=catOk && qOk;
      c.style.display=show?'':'none';
      if(show) visible++;
    });
    empty.style.display=visible?'none':'block';
  }
  chips.forEach(function(ch){
    ch.addEventListener('click',function(){
      chips.forEach(function(x){x.setAttribute('aria-pressed','false')});
      ch.setAttribute('aria-pressed','true');
      filter=ch.getAttribute('data-filter');
      apply();
    });
  });
  q.addEventListener('input',apply);
})();
