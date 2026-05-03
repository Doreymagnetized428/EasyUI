/* Feature #014 — أداة القص */

    let ctx, imgObj, scale,
        sel = { x:0, y:0, w:0, h:0 },
        drag = false;
    function openCropper(b64) {
      cropModal.classList.add('open');
      sel = { x:0, y:0, w:0, h:0 };
      imgObj = new Image();
      imgObj.onload = () => {
        const maxW = window.innerWidth * .8,
              maxH = window.innerHeight * .7;
        scale = Math.min(maxW / imgObj.width, maxH / imgObj.height, 1);
        cropCanvas.width  = imgObj.width * scale;
        cropCanvas.height = imgObj.height * scale;
        ctx = cropCanvas.getContext('2d');
        drawCrop();
      };
      imgObj.src = b64;
    }
    function drawCrop() {
      ctx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
      ctx.drawImage(imgObj, 0, 0, cropCanvas.width, cropCanvas.height);
      if (sel.w && sel.h) {
        ctx.fillStyle = 'rgba(16,163,127,.3)';
        ctx.fillRect(sel.x, sel.y, sel.w, sel.h);
        ctx.strokeStyle = '#10a37f';
        ctx.lineWidth = 2;
        ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
      }
    }
    cropCanvas.addEventListener('pointerdown', e => {
      sel = { x: e.offsetX, y: e.offsetY, w: 0, h: 0 };
      drag = true;
      drawCrop();
    });
    cropCanvas.addEventListener('pointermove', e => {
      if (drag) {
        sel.w = e.offsetX - sel.x;
        sel.h = e.offsetY - sel.y;
        drawCrop();
      }
    });
    window.addEventListener('pointerup', () => drag = false);
    cropOk.onclick = () => {
      let out;
      if (!sel.w || !sel.h) {
        out = imgObj.src;
      } else {
        const cv = document.createElement('canvas');
        const sx = Math.min(sel.x, sel.x + sel.w) / scale,
              sy = Math.min(sel.y, sel.y + sel.h) / scale,
              sw = Math.abs(sel.w) / scale,
              sh = Math.abs(sel.h) / scale;
        cv.width  = sw;
        cv.height = sh;
        cv.getContext('2d').drawImage(imgObj, sx, sy, sw, sh, 0, 0, sw, sh);
        out = cv.toDataURL('image/png');
      }
      const fileIndex = window._cropperFileIndex || 0;
      files[fileIndex].data = out;
      cropModal.classList.remove('open');
      renderFilePreviews();
    };
    cropToMask.onclick = () => {
      // تحويل الصورة للماسك بدون قص
      cropModal.classList.remove('open');
      // فتح محرر الأقنعة للصورة المحددة
      const fileIndex = window._cropperFileIndex || 0;
      if (window.openMaskEditor) {
        window.openMaskEditor(fileIndex);
      } else {
        console.error('محرر الأقنعة غير جاهز بعد');
      }
    };
    cropCancel.onclick = () => {
      cropModal.classList.remove('open');
    };

    