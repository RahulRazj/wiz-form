import multer from "multer";

export function errorHandler(error, req, res, next) {
    if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({
                error: "Uploaded file is too large. Max file size is 5 MB."
            });
        }

        return res.status(400).json({ error: error.message });
    }

    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
        error: error.message || "Something went wrong on the server."
    });
}
