/* Feature #017 — Lightbox */

    function openLightbox(i) {
      if (!chatMedia[i] || chatMedia[i].type !== 'image') return;
      
      lbIndex = i;
      lbImg.src = chatMedia[i].src;
      lightbox.classList.add('open');
      
      lbPrev.style.display = i > 0 ? 'block' : 'none';
      lbNext.style.display = i < chatMedia.length - 1 ? 'block' : 'none';
    }
    lbClose.onclick = () => lightbox.classList.remove('open');
    lbPrev.onclick = () => {
      let prevIdx = lbIndex - 1;
      while (prevIdx >= 0 && chatMedia[prevIdx].type !== 'image') prevIdx--;
      if (prevIdx >= 0) {
        lbIndex = prevIdx;
        lbImg.src = chatMedia[lbIndex].src;
        lbPrev.style.display = lbIndex > 0 ? 'block' : 'none';
        lbNext.style.display = 'block';
      }
    };
    lbNext.onclick = () => {
      let nextIdx = lbIndex + 1;
      while (nextIdx < chatMedia.length && chatMedia[nextIdx].type !== 'image') nextIdx++;
      if (nextIdx < chatMedia.length) {
        lbIndex = nextIdx;
        lbImg.src = chatMedia[lbIndex].src;
        lbPrev.style.display = 'block';
        lbNext.style.display = nextIdx < chatMedia.length - 1 ? 'block' : 'none';
      }
    };
    // لا نغلق الـ lightbox عند الضغط على الصورة نفسها
    // الإغلاق فقط من زر X
    lbImg.onclick = () => {};

    