// Peak magnitude of g-force
let peak = {
    magnitude: 0,
    angle: 0,
    timer: null,
    showAfter: 1500,  // 1.5 seconds to confirm peak
    disappearAfter: 5000  // 5 seconds to hide peak
};

const socket = io.connect('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('gforce-update', (gForceArray) => {
  const vector = document.getElementById('vector');
  const gForceText = document.getElementById('g-force-text');
  const peakVector = document.getElementById('peak-vector');
  const peakText = document.getElementById('peak-text');

  // Scale factor for maximum g-force (1.5Gs)
  const maxG = 1.5;

  // Calculate the angle and magnitude of the vector
  const angle = Math.atan2(gForceArray[1], gForceArray[0]) * (180 / Math.PI);  // Angle in degrees
  const magnitude = Math.min(Math.sqrt(gForceArray[0] ** 2 + gForceArray[1] ** 2) / maxG, 1);  // Normalize to maxG

  // Update vector rotation and length
  vector.style.transform = `translateX(-50%) translateY(-100%) rotate(${angle}deg) scaleY(${magnitude})`;

  // Display the total g-force
  const totalGForce = (magnitude * maxG).toFixed(2);
  gForceText.innerText = `Current: ${totalGForce} G`;

  // Check if current magnitude exceeds peak magnitude
  if (magnitude * maxG > peak.magnitude * maxG) {
    if (peak.timer) clearTimeout(peak.timer); // Clear existing timer if peak is updated
    peak.magnitude = magnitude;
    peak.angle = angle;

    // Set a timer to show the peak vector
    peak.timer = setTimeout(() => {
      peakVector.style.transform = `translateX(-50%) translateY(-100%) rotate(${peak.angle}deg) scaleY(${peak.magnitude})`;
      peakVector.style.display = 'block';
      peakText.innerText = `Peak: ${(peak.magnitude * maxG).toFixed(2)} G`;

      // Set a timer to hide the peak vector after 5 seconds
      setTimeout(() => {
        peakVector.style.display = 'none';
        peakText.innerText = '';
        peak.magnitude = 0;  // Reset peak magnitude
      }, peak.disappearAfter);
    }, peak.showAfter);
  }

// Handle maxG slider change
document.getElementById('maxG-slider').addEventListener('input', (event) => {
  maxG = parseFloat(event.target.value);
  document.getElementById('maxG-value').innerText = maxG.toFixed(1);
});

// Handle disappearAfter slider change
document.getElementById('disappearAfter-slider').addEventListener('input', (event) => {
  peak.disappearAfter = parseFloat(event.target.value) * 1000;  // Convert to milliseconds
  document.getElementById('disappearAfter-value').innerText = parseFloat(event.target.value).toFixed(1);
});
  
  // console.log('Received data:', gForceArray);
  // const xElement = document.getElementById('x-display');
  // const yElement = document.getElementById('y-display');
  // const zElement = document.getElementById('z-display');

  // xElement.textContent = gForceArray[0].toFixed(2);
  // yElement.textContent = gForceArray[1].toFixed(2);
  // zElement.textContent = gForceArray[2].toFixed(2);
});
