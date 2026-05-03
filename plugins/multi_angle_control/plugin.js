/* Multi-Angle Control Plugin - محرر الزوايا 3D */
(function() {
  'use strict';
  
  console.log('[Multi-Angle Control] loading...');
  
  // State
  let state = {
    azimuth: 0,
    elevation: 0,
    distance: 1.0
  };
  
  let scene = null;
  let camera = null;
  let renderer = null;
  let mesh = null;
  let animationFrame = null;
  
  // Load Three.js if not present
  function loadThreeJS(callback) {
    if (typeof THREE !== 'undefined') {
      callback();
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    script.onload = () => {
      console.log('[Multi-Angle] Three.js loaded');
      callback();
    };
    script.onerror = () => {
      console.error('[Multi-Angle] Failed to load Three.js');
    };
    document.head.appendChild(script);
  }
  
  // Initialize 3D scene
  function initScene(canvas) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1635);
    
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
    camera.position.set(0, 0, 2.5);
    
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    // إضاءة
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const light = new THREE.DirectionalLight(0xffffff, 0.8);
    light.position.set(5, 5, 5);
    scene.add(light);
    
    // إنشاء شخصية بسيطة
    const geo = new THREE.BoxGeometry(0.4, 1.2, 0.4);
    
    // إنشاء textures مع نص
    const createTextTexture = (text, color) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 60px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 128);
      const texture = new THREE.CanvasTexture(canvas);
      return new THREE.MeshStandardMaterial({ map: texture });
    };
    
    const materials = [
      createTextTexture('RIGHT', '#4ecdc4'),
      createTextTexture('LEFT', '#95e1d3'),
      new THREE.MeshStandardMaterial({ color: 0xffe66d }),
      new THREE.MeshStandardMaterial({ color: 0xf38181 }),
      createTextTexture('FRONT', '#ff6b6b'),
      createTextTexture('BACK', '#aa96da')
    ];
    
    mesh = new THREE.Mesh(geo, materials);
    scene.add(mesh);
    
    animate();
  }
  
  // Update camera position
  function updateCamera() {
    if (!camera) return;
    
    const azRad = state.azimuth * Math.PI / 180;
    const elRad = state.elevation * Math.PI / 180;
    const d = state.distance * 2.5;
    const x = d * Math.sin(azRad) * Math.cos(elRad);
    const y = d * Math.sin(elRad);
    const z = d * Math.cos(azRad) * Math.cos(elRad);
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
  }
  
  // Render loop
  function animate() {
    animationFrame = requestAnimationFrame(animate);
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }
  
  // Generate prompt from angles
  function generatePrompt() {
    const az = state.azimuth % 360;
    const hDir = az < 22.5 || az >= 337.5 ? "front view"
      : az < 67.5 ? "front-right quarter view"
      : az < 112.5 ? "right side view"
      : az < 157.5 ? "back-right quarter view"
      : az < 202.5 ? "back view"
      : az < 247.5 ? "back-left quarter view"
      : az < 292.5 ? "left side view"
      : "front-left quarter view";
    
    const vDir = state.elevation < -15 ? "low-angle shot"
      : state.elevation < 15 ? "eye-level shot"
      : state.elevation < 45 ? "elevated shot"
      : "high-angle shot";
    
    const dist = state.distance === 0.6 ? "close-up"
      : state.distance === 1.0 ? "medium shot"
      : "wide shot";
    
    return `${hDir} ${vDir} ${dist}`;
  }
  
  // Show control modal
  function showAngleEditor() {
    loadThreeJS(() => {
      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: transparent;
        backdrop-filter: none;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        direction: rtl;
      `;
      
      const container = document.createElement('div');
      container.style.cssText = `
        background: linear-gradient(135deg, #0f0f23, #1a1635);
        border: 2px solid #a78bfa;
        border-radius: 20px;
        padding: 0;
        max-width: 900px;
        width: 90%;
        max-height: 90vh;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
        display: flex;
        flex-direction: column;
      `;
      
      // العنوان
      const header = document.createElement('div');
      header.style.cssText = `
        background: linear-gradient(135deg, #1e1b4b, #312e81);
        padding: 20px 30px;
        border-bottom: 2px solid rgba(167, 139, 250, 0.3);
        display: flex;
        align-items: center;
        justify-content: space-between;
      `;
      header.innerHTML = `
        <h2 style="margin: 0; color: #a78bfa; display: flex; align-items: center; gap: 10px; font-size: 22px;">
          🎥 3D Camera Angle Editor
        </h2>
        <button onclick="this.closest('div').parentElement.parentElement.remove()" 
          style="background: transparent; border: none; color: #999; font-size: 28px; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">×</button>
      `;
      container.appendChild(header);
      
      // المحتوى الرئيسي
      const mainContent = document.createElement('div');
      mainContent.style.cssText = `
        display: flex;
        flex: 1;
        overflow: hidden;
      `;
      
      // قسم العرض 3D
      const leftPanel = document.createElement('div');
      leftPanel.style.cssText = `
        flex: 1;
        padding: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(15, 15, 35, 0.5);
      `;
      
      const canvasWrapper = document.createElement('div');
      canvasWrapper.style.cssText = `
        width: 100%;
        max-width: 450px;
        aspect-ratio: 1;
        background: linear-gradient(135deg, #1a1635, #0f0f23);
        border: 3px solid rgba(167, 139, 250, 0.3);
        border-radius: 16px;
        position: relative;
        overflow: hidden;
      `;
      
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'width: 100%; height: 100%; display: block;';
      canvasWrapper.appendChild(canvas);

      // Horizontal control (bottom)
      const horizontalControl = document.createElement('div');
      horizontalControl.style.cssText = `
        position: absolute;
        bottom: 4px;
        left: 50%;
        transform: translateX(-50%);
        width: 68%;
        padding: 8px 12px;
        background: rgba(26, 22, 53, 0.65);
        border: 1px solid rgba(167, 139, 250, 0.25);
        border-radius: 10px;
        box-shadow: 0 6px 14px rgba(0,0,0,0.35);
        backdrop-filter: blur(6px);
      `;
      horizontalControl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="color: #e0d7ff; font-size: 13px; font-weight: 600;">Horizontal Rotation</span>
          <span id="az-val" style="color: #c4b5fd; font-weight: 700; font-size: 14px;">0°</span>
        </div>
        <input type="range" id="az-slider" min="0" max="360" value="0" style="width: 100%;">
      `;
      canvasWrapper.appendChild(horizontalControl);

      // Vertical control (right side)
      const verticalControl = document.createElement('div');
      verticalControl.style.cssText = `
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        width: 96px;
        padding: 8px 6px;
        background: rgba(26, 22, 53, 0.65);
        border: 1px solid rgba(167, 139, 250, 0.25);
        border-radius: 10px;
        box-shadow: 0 6px 14px rgba(0,0,0,0.35);
        backdrop-filter: blur(6px);
        display: flex;
        flex-direction: column;
        gap: 4px;
      `;
      verticalControl.innerHTML = `
        <div style="text-align: center;">
          <div style="color: #e0d7ff; font-size: 12px; font-weight: 600;">Vertical</div>
          <div id="el-val" style="color: #c4b5fd; font-weight: 700; font-size: 13px;">0°</div>
        </div>
        <input type="range" id="el-slider" min="-30" max="60" value="0" style="
          writing-mode: bt-lr;
          -webkit-appearance: slider-vertical;
          appearance: slider-vertical;
          width: 10px;
          height: 120px;
          margin: 0 auto;
        ">
      `;
      canvasWrapper.appendChild(verticalControl);

      // زر الإرسال داخل بطاقة العرض 3D
      const floatingSendBtn = document.createElement('button');
      floatingSendBtn.id = 'send-prompt-btn';
      floatingSendBtn.textContent = '✓ Send';
      floatingSendBtn.style.cssText = `
        position: absolute;
        top: 12px;
        left: 12px;
        padding: 12px 16px;
        background: linear-gradient(135deg, #10a37f 0%, #0d7a5f 100%);
        color: white;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        box-shadow: 0 10px 22px rgba(16, 163, 127, 0.35);
        z-index: 2;
        transition: all 0.3s ease;
      `;
      canvasWrapper.appendChild(floatingSendBtn);
      
      leftPanel.appendChild(canvasWrapper);
      mainContent.appendChild(leftPanel);
      
      // قسم التحكم
      const rightPanel = document.createElement('div');
      rightPanel.style.cssText = `
        width: 320px;
        padding: 20px;
        background: linear-gradient(180deg, #1a1635, #0f0f23);
        overflow-y: auto;
        border-left: 2px solid rgba(167, 139, 250, 0.2);
      `;
      
      // أزرار الزوايا السريعة
      const presetsSection = document.createElement('div');
      presetsSection.style.cssText = 'margin-bottom: 12px;';
      presetsSection.innerHTML = `
        <h3 style="color: #c4b5fd; font-size: 14px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
          🎯 Quick Angles
        </h3>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
          <button class="angle-preset" data-az="0" data-el="0">Front</button>
          <button class="angle-preset" data-az="180" data-el="0">Back</button>
          <button class="angle-preset" data-az="270" data-el="0">Left</button>
          <button class="angle-preset" data-az="90" data-el="0">Right</button>
          <button class="angle-preset" data-az="0" data-el="60">Top</button>
          <button class="angle-preset" data-az="0" data-el="-30">Bottom</button>
        </div>
      `;
      rightPanel.appendChild(presetsSection);
      
      // سلايدرات التحكم
      const controlsSection = document.createElement('div');
      controlsSection.style.cssText = 'margin-bottom: 12px;';
      controlsSection.innerHTML = `
        <h3 style="color: #c4b5fd; font-size: 14px; margin-bottom: 6px;">🎚️ Precision Controls</h3>
        <div style="padding: 10px; background: rgba(26, 22, 53, 0.4); border-radius: 10px; border: 1px solid rgba(167, 139, 250, 0.15);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="color: #b4b4c5; font-size: 13px;">Distance</span>
            <span id="dist-val" style="color: #c4b5fd; font-weight: 700; font-size: 14px;">1.0x</span>
          </div>
          <select id="dist-select" style="width: 100%; padding: 7px; background: rgba(26, 22, 53, 0.8); border: 2px solid rgba(76, 29, 149, 0.5); border-radius: 8px; color: #e0d7ff; font-size: 13px; cursor: pointer;">
            <option value="0.6">Close-up (0.6x)</option>
            <option value="1.0" selected>Medium (1.0x)</option>
            <option value="1.8">Wide (1.8x)</option>
          </select>
        </div>
      `;
      rightPanel.appendChild(controlsSection);
      
      // عرض النص المُولّد
      const promptSection = document.createElement('div');
      promptSection.innerHTML = `
        <h3 style="color: #c4b5fd; font-size: 14px; margin-bottom: 6px;">💬 Generated Prompt</h3>
        <div id="generated-prompt" style="
          padding: 12px;
          background: rgba(26, 22, 53, 0.6);
          border: 2px solid rgba(76, 29, 149, 0.5);
          border-radius: 10px;
          color: #e0d7ff;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          line-height: 1.5;
          min-height: 60px;
          margin-bottom: 8px;
        ">front view eye-level shot medium shot</div>
        
        <div style="display: grid; grid-template-columns: 1fr; gap: 8px;">
          <button id="reset-angle-btn" style="
            padding: 12px;
            background: rgba(255,255,255,0.08);
            color: #e0d7ff;
            border: 1px solid rgba(167,139,250,0.4);
            border-radius: 10px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: all 0.3s ease;
          ">
            ↺ Reset
          </button>
        </div>
      `;
      rightPanel.appendChild(promptSection);

      // Responsive adjustments for mobile
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        mainContent.style.flexDirection = 'column';
        leftPanel.style.padding = '16px 16px 8px';
        canvasWrapper.style.maxWidth = '320px';
        canvasWrapper.style.height = '320px';
        horizontalControl.style.width = '88%';
        horizontalControl.style.bottom = '6px';
        verticalControl.style.right = '6px';
        verticalControl.style.width = '80px';
        const elSlider = verticalControl.querySelector('#el-slider');
        if (elSlider) {
          elSlider.style.height = '110px';
        }
        floatingSendBtn.style.top = '10px';
        floatingSendBtn.style.left = '10px';
        floatingSendBtn.style.padding = '10px 12px';
        floatingSendBtn.style.fontSize = '13px';
        rightPanel.style.width = '100%';
        rightPanel.style.padding = '14px';
        rightPanel.style.borderLeft = 'none';
        rightPanel.style.borderTop = '2px solid rgba(167, 139, 250, 0.2)';
        rightPanel.style.maxHeight = '40vh';
      }
      
      mainContent.appendChild(rightPanel);
      container.appendChild(mainContent);
      modal.appendChild(container);
      document.body.appendChild(modal);
      
      // إضافة أنماط CSS للأزرار والسلايدرات
      const style = document.createElement('style');
      style.textContent = `
        .angle-preset {
          padding: 10px;
          background: linear-gradient(135deg, rgba(76, 29, 149, 0.8), rgba(91, 33, 182, 0.8));
          border: 2px solid rgba(167, 139, 250, 0.3);
          border-radius: 8px;
          color: #e0d7ff;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          transition: all 0.3s ease;
        }
        .angle-preset:hover {
          background: linear-gradient(135deg, #5b21b6, #6d28d9);
          border-color: #a78bfa;
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(167, 139, 250, 0.5);
        }
        .angle-preset.active {
          background: linear-gradient(135deg, #a78bfa, #c4b5fd);
          border-color: #e0d7ff;
          color: #1a1635;
        }
        input[type="range"] {
          height: 8px;
          background: linear-gradient(90deg, rgba(26, 22, 53, 0.8), rgba(15, 15, 35, 0.8));
          border-radius: 8px;
          outline: none;
          -webkit-appearance: none;
          border: 1px solid rgba(76, 29, 149, 0.3);
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          background: linear-gradient(135deg, #a78bfa, #c4b5fd);
          border-radius: 50%;
          border: 2px solid #fff;
          box-shadow: 0 4px 15px rgba(167, 139, 250, 0.6);
          cursor: pointer;
          transition: transform 0.2s;
        }
        input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }
        input[type="range"]::-moz-range-thumb {
          width: 20px;
          height: 20px;
          background: linear-gradient(135deg, #a78bfa, #c4b5fd);
          border-radius: 50%;
          border: 2px solid #fff;
          box-shadow: 0 4px 15px rgba(167, 139, 250, 0.6);
          cursor: pointer;
          transition: transform 0.2s;
        }
        input[type="range"]::-moz-range-thumb:hover {
          transform: scale(1.2);
        }
        #send-prompt-btn:hover {
          background: linear-gradient(135deg, #0d7a5f 0%, #10a37f 100%);
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(16, 163, 127, 0.5);
        }
      `;
      document.head.appendChild(style);
      
      // تهيئة المشهد 3D
      setTimeout(() => {
        initScene(canvas);
        updateCamera();
      }, 100);
      
      // ربط الأحداث
      const azSlider = document.getElementById('az-slider');
      const elSlider = document.getElementById('el-slider');
      const distSelect = document.getElementById('dist-select');
      const promptDisplay = document.getElementById('generated-prompt');
      const sendBtn = document.getElementById('send-prompt-btn');
      const resetBtn = document.getElementById('reset-angle-btn');
      
      function updateUI() {
        document.getElementById('az-val').textContent = state.azimuth + '°';
        document.getElementById('el-val').textContent = state.elevation + '°';
        document.getElementById('dist-val').textContent = state.distance.toFixed(1) + 'x';
        promptDisplay.textContent = `QwenMultipleAngles <sks> ${generatePrompt()}`;
        updateCamera();
      }
      
      azSlider.oninput = (e) => {
        state.azimuth = +e.target.value;
        updateUI();
      };
      
      elSlider.oninput = (e) => {
        state.elevation = +e.target.value;
        updateUI();
      };
      
      distSelect.onchange = (e) => {
        state.distance = +e.target.value;
        updateUI();
      };
      
      // أزرار الزوايا السريعة
      document.querySelectorAll('.angle-preset').forEach(btn => {
        btn.onclick = () => {
          state.azimuth = +btn.dataset.az;
          state.elevation = +btn.dataset.el;
          azSlider.value = state.azimuth;
          elSlider.value = state.elevation;
          updateUI();
          
          document.querySelectorAll('.angle-preset').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        };
      });
      
      // زر الإرسال
      sendBtn.onclick = () => {
        const prompt = generatePrompt();
        const fullPrompt = `QwenMultipleAngles <sks> ${prompt}`;
        const input = document.getElementById('mainInput')
          || document.querySelector('#composer textarea')
          || document.getElementById('userInput');
        
        if (!input) {
          alert('Input field not found');
          return;
        }
        
        const currentValue = input.value.trim();
        const newValue = currentValue ? `${currentValue}, ${fullPrompt}` : fullPrompt;
        input.value = newValue;
        // إجبار الواجهة على ملاحظة التغيير وتفعيل زر الإرسال
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        
        input.focus();

        modal.remove();
        console.log('[Multi-Angle] Sent:', fullPrompt);
      };

      // زر إعادة التعيين
      resetBtn.onclick = () => {
        state = { azimuth: 0, elevation: 0, distance: 1.0 };
        azSlider.value = state.azimuth;
        elSlider.value = state.elevation;
        distSelect.value = state.distance;
        updateUI();
        // تفعيل أول زر زوايا سريعة
        const presets = document.querySelectorAll('.angle-preset');
        presets.forEach((b, idx) => b.classList.toggle('active', idx === 0));
      };
      
      // إغلاق عند الضغط على الخلفية
      modal.onclick = (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      };
    });
  }
  
  // Init plugin
  function init() {
    console.log('[Multi-Angle Control] تم التفعيل');
  }
  
  // Register plugin
  if (window.registerPlugin) {
    window.registerPlugin({
      id: 'multi_angle_control',
      name: 'التحكم بالزوايا المتعددة',
      version: '1.0.0',
      onLoad: init,
      onAction: showAngleEditor,
      closePluginsDialogOnAction: true
    });
  }
  
  // Auto-run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
