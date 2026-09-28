// Dev-only page: loads the rendered verification e-mail from /api/email-preview into the frame (see EMAIL-TEMPLATE.md).
(function () {
  var frame = document.querySelector('iframe'), note = document.querySelector('.note');
  function load() {
    var url = '/api/email-preview?purpose=' + document.getElementById('purpose').value + '&lang=' + document.getElementById('lang').value;
    fetch(url).then(function (response) {
      var available = response.ok;
      frame.hidden = !available; note.hidden = available;
      if (available) frame.src = url;
    }).catch(function () { frame.hidden = true; note.hidden = false; });
  }
  document.getElementById('purpose').addEventListener('change', load);
  document.getElementById('lang').addEventListener('change', load);
  load();
})();
