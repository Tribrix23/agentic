export function sendNotification(title: string, body?: string) {
  try {
    const options = { body };
    if (Notification.permission === "granted") {
      new Notification(title, options);
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          new Notification(title, options);
        }
      });
    }
  } catch (e) {
    console.error("Failed to send notification", e);
  }
}
