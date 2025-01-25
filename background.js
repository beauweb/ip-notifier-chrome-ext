// Configuration
const CHECK_INTERVAL = 1000; // 1 second
const IP_API = 'https://api.ipify.org?format=json';
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

// State management
let currentIP = null;
let changeCount = 0;

// Keep the extension alive
chrome.runtime.onStartup.addListener(() => {
  setInterval(chrome.runtime.getPlatformInfo, 20e3);
});

// Show notifications
async function showNotification(title, message) {
  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon48.png',
      title: title,
      message: message,
      priority: 2
    });
  } catch (error) {
    console.error('Notification error:', error);
  }
}

// Update badge
async function updateBadge(text, color = '#4688F1') {
  try {
    console.log('Updating badge text:', text);
    await chrome.action.setBadgeBackgroundColor({ color: color });
    await chrome.action.setBadgeText({ text: text });
  } catch (error) {
    console.error('Badge update error:', error);
  }
}

// Retry mechanism for fetch
async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log('Fetching URL:', url);
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }
}

// Check IP address
async function checkIP() {
  try {
    // Check for network connectivity first
    if (!navigator.onLine) {
      if (currentIP !== 'No internet connection') {
        currentIP = 'No internet connection';
        await updateBadge('!', '#FF0000');
        await showNotification(
          'Connection Error',
          'Please check your internet connection'
        );
      }
      return;
    }

    const response = await fetchWithRetry(IP_API, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      cache: 'no-cache'
    });

    const data = await response.json();
    console.log('API response:', data);

    if (!data.ip) {
      throw new Error('No IP address in response');
    }

    const ip = data.ip.trim();

    // Validate IP format
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
      throw new Error('Invalid IP format received');
    }

    // First time getting IP or IP changed
    if (!currentIP || currentIP !== ip) {
      changeCount++;
      currentIP = ip;
      await updateBadge(changeCount.toString(), '#FF4444');
      await showNotification(
        'IP Address Changed',
        `New IP: ${ip}`
      );
    }

  } catch (error) {
    // Show notification for persistent errors
    if (error.message === 'No internet connection') {
      if (currentIP !== 'No internet connection') {
        currentIP = 'No internet connection';
        await updateBadge('!', '#FF0000');
        await showNotification(
          'Connection Error',
          'Please check your internet connection'
        );
      }
    } else {
      // Log the error to the console, but don't show a notification
      // console.error('IP check error:', error.message);
    }
  }
}


// Initial check with a slight delay to ensure extension is fully loaded
setTimeout(checkIP, 1000);

// Set up periodic checks
const checkInterval = setInterval(checkIP, CHECK_INTERVAL);

// Handle extension messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "getIP") {
    if (currentIP) {
      sendResponse({ ip: currentIP });
    } else {
      sendResponse({ ip: 'Checking...' });
      checkIP(); // Trigger a new check
    }
    return true;
  }
  else if (request.type === "clearBadge") {
    changeCount = 0;
    updateBadge('');
    return true;
  }
});

// Cleanup on uninstall
chrome.runtime.onSuspend.addListener(() => {
  if (checkInterval) {
    clearInterval(checkInterval);
  }
});

// Installation handling
chrome.runtime.onInstalled.addListener(() => {
  updateBadge('');
  checkIP();
});
