/* Feature #006 — تاريخ الإرسالات */

    const sendHistory = [];
    // make available to older code that expects window.sendHistory
    try { window.sendHistory = window.sendHistory || sendHistory; } catch(e){}

