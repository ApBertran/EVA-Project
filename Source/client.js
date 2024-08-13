const socket = io.connect('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('gforce-update', (gForceArray) => {
  const barX = document.getElementById('bar-x');
  const barY = document.getElementById('bar-y');
  const gForceText = document.getElementById('g-force-text');

  // Scale factor for maximum g-force (1.5Gs)
  const maxG = 1.5;

  // Update horizontal bar (x-axis, pitch)
  const xOffset = (gForceArray[0] / maxG) * 50;  // Percentage offset from center
  barX.style.width = `${Math.abs(xOffset)}%`;
  barX.style.transform = `translateX(${xOffset}%)`;

  // Update vertical bar (y-axis, lateral acceleration)
  const yOffset = (gForceArray[1] / maxG) * 50;  // Percentage offset from center
  barY.style.height = `${Math.abs(yOffset)}%`;
  barY.style.transform = `translateY(${-yOffset}%)`;

  // Calculate total g-force and display it
  const totalGForce = Math.sqrt(gForceArray[0] ** 2 + gForceArray[1] ** 2).toFixed(2);
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
