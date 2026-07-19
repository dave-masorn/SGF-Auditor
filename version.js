/**
 * Cache-busting version layer.
 * MUST load in <head> BEFORE any other local <script> tags.
 * Rewrites all local <script src> and <link href> to append ?v=VERSION,
 * forcing the browser to re-fetch on every version bump.
 */
(function () {
    var VERSION = '0.1.019';

    /* ── Cache-bust: rewrite local <script> and <link> tags on DOMContentLoaded ── */
    function bustCache() {
        var tags = document.querySelectorAll('script[src], link[rel="stylesheet"][href]');
        for (var i = 0; i < tags.length; i++) {
            var el = tags[i];
            var attr = el.tagName === 'SCRIPT' ? 'src' : 'href';
            var url  = el.getAttribute(attr);
            if (!url) continue;
            if (/^https?:\/\//.test(url)) continue;
            if (url.indexOf('?v=') !== -1) continue;
            el.setAttribute(attr, url + '?v=' + VERSION);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bustCache);
    } else {
        bustCache();
    }

    /* ── Version label ── */
    var now = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var ts  = now.getFullYear() + '-'
            + pad(now.getMonth() + 1) + '-'
            + pad(now.getDate()) + ' '
            + pad(now.getHours()) + ':'
            + pad(now.getMinutes()) + ':'
            + pad(now.getSeconds());

    var label = 'v=' + VERSION + ' (' + ts + ')';

    function applyLabel() {
        var els = document.querySelectorAll('.header-version');
        for (var i = 0; i < els.length; i++) {
            els[i].textContent = label;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyLabel);
    } else {
        applyLabel();
    }
})();
