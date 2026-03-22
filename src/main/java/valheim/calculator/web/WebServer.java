package valheim.calculator.web;

import com.sun.net.httpserver.HttpServer;
import lombok.extern.log4j.Log4j2;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.Executors;

@Log4j2
public class WebServer {

    private static final int PORT = 8080;

    public static void start() throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);

        server.createContext("/calculate", new CalculateHandler());
        server.createContext("/health",    new HealthHandler());
        server.createContext("/",          WebServer::serveStatic);

        server.setExecutor(Executors.newCachedThreadPool());
        server.start();

        log.info("Server started → http://localhost:{}", PORT);
        log.info("Press Ctrl+C to stop.");
    }

    private static void serveStatic(com.sun.net.httpserver.HttpExchange exchange) throws IOException {
        String uriPath = exchange.getRequestURI().getPath();
        if ("/".equals(uriPath)) uriPath = "/index.html";

        // Guard against directory traversal
        if (uriPath.contains("..")) {
            exchange.sendResponseHeaders(403, -1);
            return;
        }

        Path file = Path.of("ui" + uriPath);
        if (!Files.exists(file) || Files.isDirectory(file)) {
            exchange.sendResponseHeaders(404, -1);
            return;
        }

        String ext = uriPath.substring(uriPath.lastIndexOf('.') + 1);
        String contentType = switch (ext) {
            case "html" -> "text/html; charset=utf-8";
            case "js"   -> "application/javascript";
            case "css"  -> "text/css";
            case "json" -> "application/json; charset=utf-8";
            default     -> "application/octet-stream";
        };

        byte[] body = Files.readAllBytes(file);
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.sendResponseHeaders(200, body.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(body);
        }
    }
}

