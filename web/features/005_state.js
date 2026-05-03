/* Feature #005 — حالات */

    let open = false;
    let templates = [];
    let selectedIndex = null;
    let selectedTemplate = null;
    let mode = 'Main';
    let neg = false;
    let posB = '';
    let negB = '';
    let files = [];
    let chatMedia = [];
    let lbIndex = 0;
    let editMsgCurrentIndex = null;
    let currentUsername = localStorage.username || 'guest';
    let userSettings = {
      enable_tag_autocomplete: true,
      tag_source_main: '',
      chant_source_main: '',
      tag_include_extra_quality: true,
      enable_chants: true,
      enable_wildcards: true,
      wildcard_style: 'underscores',
      enable_tag_colors: true,
      auto_cleanup: false,
      cleanup_after_minutes: 5,
      favorite_templates: []
    };
    let currentSessionId = sid;
    let sessions = [];

    