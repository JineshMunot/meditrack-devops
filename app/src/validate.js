// Input validation for patient records (DevSecOps: never trust client input)
const GENDERS = ['Male', 'Female', 'Other'];

function validatePatient(body) {
  const errors = [];
  const b = body || {};

  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (name.length < 2 || name.length > 100) errors.push('name must be 2-100 characters');

  const age = Number(b.age);
  if (!Number.isInteger(age) || age < 0 || age > 120) errors.push('age must be a whole number between 0 and 120');

  if (!GENDERS.includes(b.gender)) errors.push('gender must be one of: ' + GENDERS.join(', '));

  const diagnosis = typeof b.diagnosis === 'string' ? b.diagnosis.trim() : '';
  if (diagnosis.length < 2 || diagnosis.length > 200) errors.push('diagnosis must be 2-200 characters');

  return {
    ok: errors.length === 0,
    errors,
    value: { name, age, gender: b.gender, diagnosis },
  };
}

module.exports = { validatePatient, GENDERS };
