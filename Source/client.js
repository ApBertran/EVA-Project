const socket = io.connect('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('gforce-update', (gForceArray) => {
  console.log('Received data:', gForceArray);
  const xElement = document.getElementById('x-display');
  const yElement = document.getElementById('y-display');
  const zElement = document.getElementById('z-display');

  xElement.textContent = gForceArray[0].toFixed(2);
  yElement.textContent = gForceArray[1].toFixed(2);
  zElement.textContent = gForceArray[2].toFixed(2);
});
