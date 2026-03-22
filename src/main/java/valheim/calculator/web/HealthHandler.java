package valheim.calculator.web;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.io.OutputStream;

public class HealthHandler implements HttpHandler {

    private static final byte[] BODY = "OK".getBytes();

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.sendResponseHeaders(200, BODY.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(BODY);
        }
    }
}

