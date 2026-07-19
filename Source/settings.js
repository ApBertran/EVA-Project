function openSettings() {
  document.getElementById('settings-overlay').classList.add('open');
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('open');
}

document.getElementById('settings-overlay').addEventListener('click', (event) => {
  if (event.target.id === 'settings-overlay') closeSettings();
});

document.getElementById('damping-slider').addEventListener('input', (event) => {
  document.getElementById('damping-value').innerText = event.target.value;
});
