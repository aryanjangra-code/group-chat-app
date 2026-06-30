const bcrypt = require('bcrypt');
const User = require('./models/User'); // Adjust the path to your actual Mongoose model

/**
 * Verifies a user's login credentials.
 * @param {string} inputUsername - The username provided by the client.
 * @param {string} inputPassword - The plain-text password provided by the client.
 * @returns {Object} - An object containing the success status and a message/data.
 */
const verifyUserLogin = async (inputUsername, inputPassword) => {
    try {
        // Step 1: Check if the username exists in the MongoDB database
        const user = await User.findOne({ username: inputUsername });

        if (!user) {
            // Note: It's best practice to return a generic error message 
            // so attackers can't guess which usernames exist in your DB.
            return { success: false, message: 'Invalid username or password' };
        }

        // Step 2: Compare the provided password with the stored hashed password
        const isPasswordCorrect = await bcrypt.compare(inputPassword, user.password);

        if (!isPasswordCorrect) {
            return { success: false, message: 'Invalid username or password' };
        }

        // Step 3: Success! The credentials are valid.
        // At this point, you would typically generate a JWT (JSON Web Token) 
        // to send back to the client for subsequent API requests.
        return { 
            success: true, 
            message: 'Authentication successful',
            userId: user._id // Safe to return the ID for token generation or session setup
        };

    } catch (error) {
        console.error("Authentication Error:", error);
        return { success: false, message: 'An internal server error occurred' };
    }
};

module.exports = verifyUserLogin;