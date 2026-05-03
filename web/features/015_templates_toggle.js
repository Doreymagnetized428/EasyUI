/* Feature #015 — زرّ التمبلت (فتح/إغلاق الشريط) */

    tplToggle.onclick = () => {
      open = !open;
      tplRow.classList.toggle('open', open);
      tplToggle.textContent = open ? '▼' : '▲';
      adjust();
    };

    