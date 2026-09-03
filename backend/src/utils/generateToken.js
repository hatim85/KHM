import jwt from 'jsonwebtoken';

/**
 * Generate a JWT token for a user.
 * @param {string} userId - The MongoDB _id of the user.
 * @returns {string} Signed JWT token.
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
};

export default generateToken;
