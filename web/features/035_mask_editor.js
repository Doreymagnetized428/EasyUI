/* ===== محرر الأقنعة ===== */

let maskEditorState = {
  canvas: null,
  ctx: null,
  maskCanvas: null,
  maskCtx: null,
  currentImage: null,
  drawing: false,
  brushSize: 30,
  softEdge: true,
  softness: 0.7, // 0..1
  useEraser: false,
  alphaValue: 255,
  brushColor: '#000000', // لون الفرشاة
  mouseX: 0,
  mouseY: 0,
  currentFileIndex: null,
  activePointerId: null,
  activeTouchId: null,
  zoom: 1.0,
  panX: 0,
  panY: 0,
  panMode: false,
  lastPanX: 0,
  lastPanY: 0,
  rafId: null, // لتحسين الأداء
  scale: 1 // نسبة التصغير (مثل cropper)
};

// صمت سجلات محرر الأقنعة
const MASK_DEBUG = false;
const clog = (...args) => { if (MASK_DEBUG) console.log(...args); };
const cerror = (...args) => { if (MASK_DEBUG) console.error(...args); };
const _t035 = (key, fallback, params) => {
  try { return window.t ? window.t(key, fallback, params) : fallback; } catch(e) { return fallback; }
};

function initMaskEditor() {
  clog('🎨 محاولة تهيئة محرر الأقنعة...');
  
  let canvas = document.getElementById('maskCanvas');
  if (!canvas) {
    cerror('❌ لم يتم العثور على maskCanvas');
    return;
  }
  
  maskEditorState.canvas = canvas;
  maskEditorState.ctx = maskEditorState.canvas.getContext('2d', { willReadFrequently: true });
  maskEditorState.maskCanvas = document.createElement('canvas');
  maskEditorState.maskCtx = maskEditorState.maskCanvas.getContext('2d', { willReadFrequently: true });
  maskEditorState.canvas.style.touchAction = 'none';

  clog('✓ تم تهيئة Canvas بنجاح');

  // إعدادات الأزرار والمدخلات
  let brushSizeInput = document.getElementById('maskBrushSize');
  let brushSizeLabel = document.getElementById('maskBrushSizeLabel');
  
  if (brushSizeInput) {
    brushSizeInput.addEventListener('input', (e) => {
      maskEditorState.brushSize = parseInt(e.target.value);
      if (brushSizeLabel) brushSizeLabel.textContent = maskEditorState.brushSize;
      redrawMaskCanvas();
    });
    clog('✓ تم ربط حجم الفرشاة');
  }

  // أزرار + و - تمت إزالتها من الواجهة

  // الشفافية
  let alphaInput = document.getElementById('maskAlpha');
  let alphaLabel = document.getElementById('maskAlphaLabel');
  if (alphaInput) {
    alphaInput.addEventListener('input', (e) => {
      maskEditorState.alphaValue = parseInt(e.target.value);
      if (alphaLabel) alphaLabel.textContent = maskEditorState.alphaValue;
      redrawMaskCanvas();
    });
    clog('✓ تم ربط الشفافية');
  }

  let eraserBtn = document.getElementById('maskEraserToggle');
  if (eraserBtn) {
    eraserBtn.addEventListener('click', toggleMaskEraser);
    clog('✓ تم ربط زر المسح');
  }

  let clearBtn = document.getElementById('maskClear');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearMaskCanvas);
    clog('✓ تم ربط زر المسح الكامل');
  }

  let invertBtn = document.getElementById('maskInvert');
  if (invertBtn) {
    invertBtn.addEventListener('click', invertMaskCanvas);
    clog('✓ تم ربط زر العكس');
  }

  let softSlider = document.getElementById('maskSoftness');
  let softLabel = document.getElementById('maskSoftnessLabel');
  if (softSlider) {
    const applySoftValue = (v) => {
      maskEditorState.softness = Math.min(Math.max(v, 0), 100) / 100;
      if (softLabel) softLabel.textContent = Math.round(maskEditorState.softness * 100) + '%';
      redrawMaskCanvas();
    };

    applySoftValue(parseInt(softSlider.value || '70', 10));

    softSlider.addEventListener('input', (e) => {
      applySoftValue(parseInt(e.target.value || '70', 10));
    });

    clog('✓ تم ربط شريط النعومة');
  }

  let softToggleBtn = document.getElementById('maskSoftToggle');
  if (softToggleBtn) {
    const updateSoftState = () => {
      softToggleBtn.classList.toggle('active', maskEditorState.softEdge);
      // لا ملاحظات سفلية لتوفير مساحة
      redrawMaskCanvas();
    };

    softToggleBtn.addEventListener('click', () => {
      maskEditorState.softEdge = !maskEditorState.softEdge;
      updateSoftState();
    });

    updateSoftState();
    clog('✓ تم ربط زر نعومة الفرشاة');
  }

  let cancelBtn = document.getElementById('maskCancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeMaskEditor);
  }

  let applyBtn = document.getElementById('maskApply');
  if (applyBtn) {
    applyBtn.addEventListener('click', applyMask);
  }
  
  // زر حفظ مع التلوين
  let saveWithOverlayBtn = document.getElementById('maskSaveWithOverlay');
  if (saveWithOverlayBtn) {
    saveWithOverlayBtn.addEventListener('click', saveImageWithOverlay);
  }
  
  // تغيير لون الفرشاة
  let brushColorInput = document.getElementById('maskBrushColor');
  if (brushColorInput) {
    brushColorInput.addEventListener('input', (e) => {
      maskEditorState.brushColor = e.target.value;
      redrawMaskCanvas();
    });
    clog('✓ تم ربط لون الفرشاة');
  }

  let closeBtn = document.getElementById('maskEditorClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeMaskEditor);
  }

  // أزرار الزوم والحركة
  let zoomInBtn = document.getElementById('maskZoomIn');
  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => {
      maskEditorState.zoom = Math.min(maskEditorState.zoom + 0.2, 3);
      redrawMaskCanvas();
    });
  }

  let zoomOutBtn = document.getElementById('maskZoomOut');
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => {
      maskEditorState.zoom = Math.max(maskEditorState.zoom - 0.2, 0.5);
      redrawMaskCanvas();
    });
  }

  let zoomResetBtn = document.getElementById('maskZoomReset');
  if (zoomResetBtn) {
    zoomResetBtn.addEventListener('click', () => {
      maskEditorState.zoom = 1.0;
      maskEditorState.panX = 0;
      maskEditorState.panY = 0;
      redrawMaskCanvas();
    });
  }

  let panModeBtn = document.getElementById('maskPanMode');
  if (panModeBtn) {
    panModeBtn.addEventListener('click', () => {
      maskEditorState.panMode = !maskEditorState.panMode;
      panModeBtn.classList.toggle('active', maskEditorState.panMode);
    });
  }

  // ===== نظام الرسم الجديد =====
  // وظيفة موحدة لحساب الإحداثيات والرسم - مع الأخذ في الاعتبار الزوم والحركة
  const getCanvasCoordinates = (clientX, clientY) => {
    let rect = maskEditorState.canvas.getBoundingClientRect();
    let scaleX = maskEditorState.canvas.width / rect.width;
    let scaleY = maskEditorState.canvas.height / rect.height;
    
    // الإحداثيات الأساسية
    let canvasX = (clientX - rect.left) * scaleX;
    let canvasY = (clientY - rect.top) * scaleY;
    
    // تطبيق العكس من الزوم والحركة
    let centerX = maskEditorState.canvas.width / 2;
    let centerY = maskEditorState.canvas.height / 2;
    
    let actualX = (canvasX - centerX - maskEditorState.panX) / maskEditorState.zoom + centerX;
    let actualY = (canvasY - centerY - maskEditorState.panY) / maskEditorState.zoom + centerY;
    
    return {
      x: actualX,
      y: actualY,
      isInside: clientX >= rect.left && clientX <= rect.right &&
                clientY >= rect.top && clientY <= rect.bottom
    };
  };

  const performDraw = (coords) => {
    if (coords.isInside && maskEditorState.drawing) {
      maskEditorState.mouseX = coords.x;
      maskEditorState.mouseY = coords.y;
      drawMaskBrush(coords.x, coords.y);
      redrawMaskCanvas();
    }
  };

  // ===== أحداث الماوس =====
  maskEditorState.canvas.addEventListener('mousedown', (e) => {
    let coords = getCanvasCoordinates(e.clientX, e.clientY);
    if (coords.isInside) {
      if (maskEditorState.panMode) {
        // وضع الحركة
        maskEditorState.lastPanX = e.clientX;
        maskEditorState.lastPanY = e.clientY;
      } else {
        // وضع الرسم
        maskEditorState.drawing = true;
        maskEditorState.mouseX = coords.x;
        maskEditorState.mouseY = coords.y;
        drawMaskBrush(coords.x, coords.y);
        redrawMaskCanvas();
      }
    }
  });

  document.addEventListener('mousemove', (e) => {
    let coords = getCanvasCoordinates(e.clientX, e.clientY);
    maskEditorState.mouseX = coords.x;
    maskEditorState.mouseY = coords.y;
    
    if (maskEditorState.panMode && maskEditorState.lastPanX !== null) {
      // الحركة
      let deltaX = e.clientX - maskEditorState.lastPanX;
      let deltaY = e.clientY - maskEditorState.lastPanY;
      maskEditorState.panX += deltaX;
      maskEditorState.panY += deltaY;
      maskEditorState.lastPanX = e.clientX;
      maskEditorState.lastPanY = e.clientY;
    } else if (maskEditorState.drawing && coords.isInside) {
      drawMaskBrush(coords.x, coords.y);
    }
    redrawMaskCanvas();
  });

  document.addEventListener('mouseup', () => {
    maskEditorState.drawing = false;
    maskEditorState.lastPanX = null;
    maskEditorState.lastPanY = null;
  });

  maskEditorState.canvas.addEventListener('mouseleave', () => {
    maskEditorState.drawing = false;
  });

  // ===== أحداث اللمس (للهاتف) =====
  let touchDownId = null;

  maskEditorState.canvas.addEventListener('touchstart', (e) => {
    if (!maskEditorState.currentImage) return;
    if (!e.touches || e.touches.length === 0) return;
    const t = e.touches[0];
    const coords = getCanvasCoordinates(t.clientX, t.clientY);
    if (coords.isInside) {
      touchDownId = t.identifier;
      if (maskEditorState.panMode) {
        maskEditorState.drawing = true;
        maskEditorState.lastPanX = t.clientX;
        maskEditorState.lastPanY = t.clientY;
      } else {
        maskEditorState.drawing = true;
        maskEditorState.mouseX = coords.x;
        maskEditorState.mouseY = coords.y;
        drawMaskBrush(coords.x, coords.y);
        redrawMaskCanvas();
      }
      e.preventDefault();
    }
  }, { passive: false });

  maskEditorState.canvas.addEventListener('touchmove', (e) => {
    if (!maskEditorState.drawing || touchDownId === null) return;
    if (!e.touches || e.touches.length === 0) return;
    let t = null;
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === touchDownId) {
        t = e.touches[i];
        break;
      }
    }
    if (!t) return;
    if (maskEditorState.panMode) {
      const panSpeed = 2.2;
      let deltaX = t.clientX - maskEditorState.lastPanX;
      let deltaY = t.clientY - maskEditorState.lastPanY;
      maskEditorState.panX += deltaX * panSpeed;
      maskEditorState.panY += deltaY * panSpeed;
      maskEditorState.lastPanX = t.clientX;
      maskEditorState.lastPanY = t.clientY;
      redrawMaskCanvas();
    } else {
      const coords = getCanvasCoordinates(t.clientX, t.clientY);
      performDraw(coords);
    }
    e.preventDefault();
  }, { passive: false });

  maskEditorState.canvas.addEventListener('touchend', (e) => {
    if (!e.changedTouches || e.changedTouches.length === 0) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchDownId) {
        maskEditorState.drawing = false;
        touchDownId = null;
        maskEditorState.lastPanX = null;
        maskEditorState.lastPanY = null;
        e.preventDefault();
        break;
      }
    }
  }, { passive: false });

  maskEditorState.canvas.addEventListener('touchcancel', (e) => {
    maskEditorState.drawing = false;
    touchDownId = null;
    e.preventDefault();
  }, { passive: false });

  clog('✓ تم ربط نظام الرسم بنجاح');
}

function loadImageToMaskEditor(imageUrl) {
  return new Promise((resolve, reject) => {
    let img = new Image();
    let loadTimeout = setTimeout(() => {
      reject(new Error(_t035('mask.image_load_failed', 'فشل تحميل الصورة')));
    }, 5000);
    
    img.onload = function() {
      clearTimeout(loadTimeout);
      // التأكد من أن الصورة صحيحة
      if (!img.width || !img.height) {
        reject(new Error(_t035('mask.invalid_image', 'صورة غير صحيحة')));
        return;
      }
      
      // حساب scale مثل cropper (للتصغير في العرض فقط)
      const MAX_SIZE = 1200;
      let scale = 1;
      
      if (img.width > MAX_SIZE || img.height > MAX_SIZE) {
        scale = Math.min(MAX_SIZE / img.width, MAX_SIZE / img.height);
      }
      
      // حجم canvas للعرض (مصغر)
      let canvasW = Math.floor(img.width * scale);
      let canvasH = Math.floor(img.height * scale);
      
      maskEditorState.currentImage = img;
      maskEditorState.scale = scale; // حفظ النسبة للاستخدام في applyMask
      maskEditorState.canvas.width = maskEditorState.maskCanvas.width = canvasW;
      maskEditorState.canvas.height = maskEditorState.maskCanvas.height = canvasH;
      maskEditorState.maskCtx.clearRect(0, 0, canvasW, canvasH);
      document.getElementById('maskStatus').textContent = '';
      redrawMaskCanvas();
      resolve();
    };
    
    img.onerror = () => {
      clearTimeout(loadTimeout);
      reject(new Error(_t035('mask.image_load_failed', 'فشل تحميل الصورة')));
    };
    
    img.src = imageUrl;
  });
}

function drawMaskBrush(x, y) {
  const r = maskEditorState.brushSize;
  const ctx = maskEditorState.maskCtx;

  // تحويل اللون hex إلى RGB
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 0, b: 0 };
  };
  
  const rgb = hexToRgb(maskEditorState.brushColor);
  
  let fill;
  if (maskEditorState.softEdge) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const fadeStart = 1 - 0.7 * maskEditorState.softness;
    const midAlpha = 0.6 + 0.2 * (1 - maskEditorState.softness);
    g.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},1)`);
    g.addColorStop(fadeStart, `rgba(${rgb.r},${rgb.g},${rgb.b},${midAlpha})`);
    g.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
    fill = g;
  } else {
    fill = `rgba(${rgb.r},${rgb.g},${rgb.b},1)`;
  }

  ctx.fillStyle = fill;
  ctx.globalCompositeOperation = maskEditorState.useEraser ? 'destination-out' : 'source-over';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

function redrawMaskCanvas() {
  if (!maskEditorState.currentImage) return;
  
  // إلغاء الطلب السابق إن وُجد (تحسين الأداء)
  if (maskEditorState.rafId) {
    cancelAnimationFrame(maskEditorState.rafId);
  }
  
  maskEditorState.rafId = requestAnimationFrame(() => {
    maskEditorState.ctx.clearRect(0, 0, maskEditorState.canvas.width, maskEditorState.canvas.height);
    
    // حفظ الحالة الحالية للتحويل
    maskEditorState.ctx.save();
    
    // تطبيق الزوم والحركة
    let centerX = maskEditorState.canvas.width / 2;
    let centerY = maskEditorState.canvas.height / 2;
    maskEditorState.ctx.translate(centerX + maskEditorState.panX, centerY + maskEditorState.panY);
    maskEditorState.ctx.scale(maskEditorState.zoom, maskEditorState.zoom);
    maskEditorState.ctx.translate(-centerX, -centerY);
    
    // رسم الصورة بحجم canvas (مثل cropper تماماً - تصغير بسيط)
    maskEditorState.ctx.drawImage(
      maskEditorState.currentImage,
      0, 0,
      maskEditorState.canvas.width,
      maskEditorState.canvas.height
    );
    
    // رسم القناع الملون مباشرة (يدعم ألوان متعددة)
    maskEditorState.ctx.globalAlpha = maskEditorState.alphaValue / 255;
    maskEditorState.ctx.drawImage(maskEditorState.maskCanvas, 0, 0);
    maskEditorState.ctx.globalAlpha = 1.0;

    // رسم شكل الفرشاة حول الماوس
    maskEditorState.ctx.beginPath();
    maskEditorState.ctx.arc(maskEditorState.mouseX, maskEditorState.mouseY, maskEditorState.brushSize, 0, Math.PI * 2);
    maskEditorState.ctx.fillStyle = 'rgba(0,0,0,0.2)';
    maskEditorState.ctx.fill();
    maskEditorState.ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    maskEditorState.ctx.lineWidth = 1;
    maskEditorState.ctx.stroke();
    
    // استرجاع الحالة
    maskEditorState.ctx.restore();
    maskEditorState.rafId = null;
  });
}

function toggleMaskEraser() {
  maskEditorState.useEraser = !maskEditorState.useEraser;
  let btn = document.getElementById('maskEraserToggle');
  
  if (maskEditorState.useEraser) {
    btn.classList.add('active');
    document.getElementById('maskStatus').textContent = '';
  } else {
    btn.classList.remove('active');
    document.getElementById('maskStatus').textContent = '';
  }
  redrawMaskCanvas();
}

function clearMaskCanvas() {
  maskEditorState.maskCtx.clearRect(0, 0, maskEditorState.maskCanvas.width, maskEditorState.maskCanvas.height);
  document.getElementById('maskStatus').textContent = '';
  redrawMaskCanvas();
}

function invertMaskCanvas() {
  let imgData = maskEditorState.maskCtx.getImageData(0, 0, maskEditorState.maskCanvas.width, maskEditorState.maskCanvas.height);
  let data = imgData.data;
  for (let i = 3; i < data.length; i += 4) {
    data[i] = 255 - data[i];
  }
  maskEditorState.maskCtx.putImageData(imgData, 0, 0);
  document.getElementById('maskStatus').textContent = '';
  redrawMaskCanvas();
}

function openMaskEditor(fileIndex) {
  let modal = document.getElementById('maskEditorModal');
  modal.classList.add('open');
  maskEditorState.currentFileIndex = fileIndex;
  
  // تحميل الصورة الأصلية من files array بدلاً من المعاينة
  if (typeof files !== 'undefined' && files[fileIndex] && files[fileIndex].data) {
    loadImageToMaskEditor(files[fileIndex].data).catch((err) => {
      clog('❌ ' + err.message);
      document.getElementById('maskStatus').textContent = err.message;
    });
  } else {
    // fallback: تحميل من المعاينة
    let filePreview = document.querySelectorAll('.file-preview')[fileIndex];
    if (filePreview && filePreview.querySelector('img')) {
      let imageUrl = filePreview.querySelector('img').src;
      loadImageToMaskEditor(imageUrl).catch((err) => {
        clog('❌ ' + err.message);
        document.getElementById('maskStatus').textContent = err.message;
      });
    }
  }
}

function closeMaskEditor() {
  let modal = document.getElementById('maskEditorModal');
  modal.classList.remove('open');
  maskEditorState.currentFileIndex = null;
  maskEditorState.currentImage = null;
}

function applyMask() {
  if (maskEditorState.currentFileIndex === null) {
    alert(_t035('mask.no_selected_image', 'لا توجد صورة محددة'));
    return;
  }

  // حفظ بنفس حجم العرض المصغر (لتجنب قص الصور الكبيرة ولتطابق ما تراه في المحرر)
  let tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = maskEditorState.canvas.width;
  tmpCanvas.height = maskEditorState.canvas.height;
  let tmpCtx = tmpCanvas.getContext('2d', { willReadFrequently: true });

  // رسم الصورة بحجم العرض المصغر
  tmpCtx.drawImage(
    maskEditorState.currentImage,
    0, 0,
    maskEditorState.currentImage.width,
    maskEditorState.currentImage.height,
    0, 0,
    tmpCanvas.width,
    tmpCanvas.height
  );
  let imgData = tmpCtx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
  
  // القناع بنفس حجم العرض المصغر بالفعل
  let maskData = maskEditorState.maskCtx.getImageData(0, 0, maskEditorState.maskCanvas.width, maskEditorState.maskCanvas.height);

  for(let i=0;i<maskData.data.length;i+=4){
    imgData.data[i+3] = 255 - maskData.data[i+3];
  }

  tmpCtx.putImageData(imgData, 0, 0);
  
  // استبدل الصورة الأصلية بالصورة المحفوظة
  let imageData = tmpCanvas.toDataURL('image/png');
  if (typeof files !== 'undefined' && files[maskEditorState.currentFileIndex]) {
    files[maskEditorState.currentFileIndex].data = imageData;
  }
  
  // تحديث الصورة في المعاينة
  let filePreview = document.querySelectorAll('.file-preview')[maskEditorState.currentFileIndex];
  if (filePreview && filePreview.querySelector('img')) {
    filePreview.querySelector('img').src = imageData;
  }

  document.getElementById('maskStatus').textContent = '';
  setTimeout(() => closeMaskEditor(), 800);
}

function saveImageWithOverlay() {
  if (maskEditorState.currentFileIndex === null) {
    alert(_t035('mask.no_selected_image', 'لا توجد صورة محددة'));
    return;
  }

  // إنشاء canvas مؤقت بنفس حجم العرض
  let tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = maskEditorState.canvas.width;
  tmpCanvas.height = maskEditorState.canvas.height;
  let tmpCtx = tmpCanvas.getContext('2d', { willReadFrequently: true });

  // رسم الصورة
  tmpCtx.drawImage(
    maskEditorState.currentImage,
    0, 0,
    maskEditorState.currentImage.width,
    maskEditorState.currentImage.height,
    0, 0,
    tmpCanvas.width,
    tmpCanvas.height
  );

  // رسم التلوين فوق الصورة (القناع الملون مباشرة)
  tmpCtx.globalAlpha = maskEditorState.alphaValue / 255;
  tmpCtx.drawImage(maskEditorState.maskCanvas, 0, 0);
  tmpCtx.globalAlpha = 1.0;

  // حفظ الصورة
  let imageData = tmpCanvas.toDataURL('image/png');
  if (typeof files !== 'undefined' && files[maskEditorState.currentFileIndex]) {
    files[maskEditorState.currentFileIndex].data = imageData;
  }
  
  // تحديث المعاينة
  let filePreview = document.querySelectorAll('.file-preview')[maskEditorState.currentFileIndex];
  if (filePreview && filePreview.querySelector('img')) {
    filePreview.querySelector('img').src = imageData;
  }

  document.getElementById('maskStatus').textContent = _t035('mask.saved_with_overlay', '✓ تم الحفظ مع التلوين');
  setTimeout(() => closeMaskEditor(), 800);
}

// جعل الدوال عامة ليتم استدعاؤها من أي مكان
window.openMaskEditor = openMaskEditor;
window.closeMaskEditor = closeMaskEditor;

clog('🚀 بدء تحميل محرر الأقنعة...');

// الطريقة 1: انتظر DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  clog('✓ تم تشغيل DOMContentLoaded');
  
  // انتظر قليلاً للتأكد من أن جميع العناصر جاهزة
  setTimeout(() => {
    clog('🔧 بدء التهيئة...');
    
    // تهيئة المحرر
    if (document.getElementById('maskCanvas')) {
      clog('✓ maskCanvas موجود');
      initMaskEditor();
    } else {
      cerror('❌ maskCanvas غير موجود');
    }
    
    // الزر مُزال من الـ HTML
  }, 200);
});

// دالة لعرض قائمة اختيار الصور
function showMaskEditorSelector() {
  let previews = document.querySelectorAll('.file-preview');
  
  if (previews.length === 0) {
    alert(_t035('mask.must_upload_image_first', 'يجب رفع صورة أولاً'));
    return;
  }
  
  if (previews.length === 1) {
    // إذا كانت صورة واحدة، افتح المحرر مباشرة
    openMaskEditor(0);
  } else {
    // إذا كانت صور متعددة، اعرض modal للاختيار
    showImageSelectorModal();
  }
}

// دالة لعرض modal اختيار الصور
function showImageSelectorModal() {
  let modal = document.createElement('div');
  modal.id = 'imageSelectorModal';
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 400;
  `;
  
  let box = document.createElement('div');
  box.style.cssText = `
    background: #fff;
    padding: 20px;
    border-radius: 12px;
    max-width: 500px;
    max-height: 70vh;
    overflow-y: auto;
    box-shadow: 0 4px 20px #0008;
  `;
  
  let title = document.createElement('h3');
  title.textContent = _t035('mask.select_image_to_edit', 'اختر صورة لتحرير القناع');
  title.style.marginTop = '0';
  box.appendChild(title);
  
  let previews = document.querySelectorAll('.file-preview');
  let grid = document.createElement('div');
  grid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
    gap: 10px;
    margin: 15px 0;
  `;
  
  previews.forEach((preview, index) => {
    let img = preview.querySelector('img');
    if (img) {
      let thumbBtn = document.createElement('button');
      thumbBtn.style.cssText = `
        border: 2px solid #ddd;
        border-radius: 8px;
        background: #f9f9f9;
        cursor: pointer;
        padding: 0;
        overflow: hidden;
        transition: all 0.2s;
      `;
      thumbBtn.onmouseover = () => {
        thumbBtn.style.borderColor = '#10a37f';
        thumbBtn.style.boxShadow = '0 0 0 2px #10a37f44';
      };
      thumbBtn.onmouseout = () => {
        thumbBtn.style.borderColor = '#ddd';
        thumbBtn.style.boxShadow = 'none';
      };
      
      let thumbImg = document.createElement('img');
      thumbImg.src = img.src;
      thumbImg.style.cssText = `
        width: 100%;
        height: 80px;
        object-fit: cover;
        display: block;
      `;
      
      thumbBtn.appendChild(thumbImg);
      thumbBtn.onclick = () => {
        document.body.removeChild(modal);
        openMaskEditor(index);
      };
      
      grid.appendChild(thumbBtn);
    }
  });
  
  box.appendChild(grid);
  
  let cancelBtn = document.createElement('button');
  cancelBtn.textContent = _t035('common.cancel', 'إلغاء');
  cancelBtn.style.cssText = `
    width: 100%;
    padding: 10px;
    border: none;
    border-radius: 6px;
    background: #999;
    color: white;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
  `;
  cancelBtn.onclick = () => document.body.removeChild(modal);
  box.appendChild(cancelBtn);
  
  modal.appendChild(box);
  document.body.appendChild(modal);
}

// الطريقة 2: إذا كان DOM جاهزاً بالفعل
if (document.readyState !== 'loading') {
  clog('✓ DOM جاهز بالفعل');
  setTimeout(() => {
    if (!maskEditorState.canvas) {
      clog('🔧 تهيئة متأخرة...');
      initMaskEditor();
    }
  }, 100);
}
