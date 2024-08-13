const socket = io.connect('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('gforce-update', (gForceArray) => {
  const vector = document.getElementById('vector');
  const gForceText = document.getElementById('g-force-text');

  // Scale factor for maximum g-force (1.5Gs)
  const maxG = 1.5;

  // Calculate the angle and magnitude of the vector
  const angle = Math.atan2(gForceArray[0], gForceArray[1]) * (180 / Math.PI);  // Angle in degrees
  const magnitude = Math.min(Math.sqrt(gForceArray[1] ** 2 + gForceArray[0] ** 2) / maxG, 1);  // Normalize to maxG

  // Update vector rotation and length
  vector.style.transform = `translateX(-50%) translateY(-100%) rotate(${angle}deg) scaleY(${magnitude})`;

  // Display the total g-force
  const totalGForce = (magnitude * maxG).toFixed(2);
  gForceText.innerText = `${totalGForce} G`;
}
  // console.log('Received data:', gForceArray);
  // const xElement = document.getElementById('x-display');
  // const yElement = document.getElementById('y-display');
  // const zElement = document.getElementById('z-display');

  // xElement.textContent = gForceArray[0].toFixed(2);
  // yElement.textContent = gForceArray[1].toFixed(2);
  // zElement.textContent = gForceArray[2].toFixed(2);
});
