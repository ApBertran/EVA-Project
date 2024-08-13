const socket = io.connect('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('gforce-update', (gForceArray) => {
  const needleX = document.getElementById('needle-x');
  const needleY = document.getElementById('needle-y');
  const needleZ = document.getElementById('needle-z');
  const gForceText = document.getElementById('g-force-text');

  // Update needle rotations
  needleX.style.transform = `rotate(${data.x * 90}deg)`;
  needleY.style.transform = `rotate(${data.y * 90}deg)`;
  needleZ.style.transform = `rotate(${data.z * 90}deg)`;

  // Calculate total g-force and display it
  const totalGForce = Math.sqrt(data.x ** 2 + data.y ** 2 + data.z ** 2).toFixed(2);
  gForceText.innerText = `${totalGForce} G`;

  // console.log('Received data:', gForceArray);
  // const xElement = document.getElementById('x-display');
  // const yElement = document.getElementById('y-display');
  // const zElement = document.getElementById('z-display');

  // xElement.textContent = gForceArray[0].toFixed(2);
  // yElement.textContent = gForceArray[1].toFixed(2);
  // zElement.textContent = gForceArray[2].toFixed(2);
});
