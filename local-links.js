(function () {
  'use strict';
  var base = new URL('.', document.currentScript.src);
  function normalizeLinks() {
    document.querySelectorAll('a[href^="/launch1500/"]').forEach(function (link) {
      link.href = new URL(link.getAttribute('href').slice('/launch1500/'.length), base).href;
    });
    if (location.pathname.indexOf('/launch1500/demos/') !== -1 || location.pathname.indexOf('/demos/') !== -1) {
      document.querySelectorAll('a').forEach(function (link) {
        var target = new URL(link.href, location.href);
        if (target.pathname.indexOf('/launch1500/start/') === -1 && target.pathname.indexOf('/start/') === -1) return;
        var assistant = new URL('index.html', base);
        assistant.searchParams.set('assistant', '1');
        var selected = target.searchParams.get('package');
        if (['lite', 'plus', 'premium'].indexOf(selected) !== -1) assistant.searchParams.set('package', selected);
        var source = target.searchParams.get('source') || '';
        var demo = /^WEB-DEMO-(1500|3000|5000)$/.exec(source);
        if (demo) {
          assistant.searchParams.set('demo', demo[1]);
          assistant.searchParams.set('source', source);
        }
        link.href = assistant.href;
      });
    }
  }
  normalizeLinks();
  document.addEventListener('launch:language', normalizeLinks);
})();
