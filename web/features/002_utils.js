/* Feature #002 — Utilities */

    const $ = q => document.querySelector(q),
          $$ = q => document.querySelectorAll(q);
    function escapeHtml(s) {
      return (s ?? '').replace(/[&<>"']/g, c => (
        { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
      ));
    }
    function formatFileSize(bytes) {
      if (bytes < 1024) return bytes + 'B';
      else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
      else return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
    }
    function formatDate(isoString) {
      if (!isoString) return '';
      const date = new Date(isoString);
      return date.toLocaleString();
    }

    