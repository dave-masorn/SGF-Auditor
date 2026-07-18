/**
 * Single source of truth for SGF Auditor version & timestamp.
 * Change VERSION_HERE below on every push — all pages auto-update.
 */
(function () {
    var VERSION = '0.0.060';

    var now = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var ts = now.getFullYear() + '-'
           + pad(now.getMonth() + 1) + '-'
           + pad(now.getDate()) + ' '
           + pad(now.getHours()) + ':'
           + pad(now.getMinutes()) + ':'
           + pad(now.getSeconds());

    var label = 'v=' + VERSION + ' (' + ts + ')';

    document.addEventListener('DOMContentLoaded', function () {
        var els = document.querySelectorAll('.header-version');
        for (var i = 0; i < els.length; i++) {
            els[i].textContent = label;
        }
    });
})();
