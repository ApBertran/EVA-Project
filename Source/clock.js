function tickClock() {
  const now = new Date();
  const hours = now.getHours() % 12 || 12;
  const minutes = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('clock').innerText = `${hours}:${minutes}`;
}

tickClock();
setInterval(tickClock, 10000);
