const bcrypt = require('bcryptjs');
const hash = '$2b$10$l6WrbGBXmmFYMUz6jgIs8uw2LDaLnUccfM0ep6lBVe6fqTCpVzuWm';
bcrypt.compare('Rj6542', hash).then(res => console.log('Match:', res));
