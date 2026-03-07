const ADMIN_SECRET = process.env.ADMIN_SECRET || 'pdpadmin';

function adminAuth(req, res, next) {
    // Allow access via token (for API/scripts) or if session user has admin role
    const token = req.query.token || req.headers['x-admin-token'];
    const isTokenAdmin = token === ADMIN_SECRET;
    const isSessionAdmin = req.user && req.user.role === 'admin'; // Role could be set dynamically

    if (isTokenAdmin || isSessionAdmin) {
        return next();
    }

    if (req.accepts('html')) {
        return res.status(403).send('<h2>Access Denied</h2><p>You need admin privileges to view this page.</p>');
    }
    return res.status(403).json({ error: 'Access denied' });
}

module.exports = adminAuth;
