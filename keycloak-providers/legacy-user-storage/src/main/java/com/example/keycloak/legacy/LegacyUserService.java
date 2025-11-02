package com.example.keycloak.legacy;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import org.jboss.logging.Logger;

public class LegacyUserService {
  private static final Logger LOGGER = Logger.getLogger(LegacyUserService.class);
  private static final ObjectMapper MAPPER =
      new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

  private final HttpClient httpClient;
  private final URI usersBaseUri;
  private final URI loginUri;

  public LegacyUserService(URI baseUri) {
    this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    URI normalizedBase =
        baseUri.toString().endsWith("/") ? baseUri : URI.create(baseUri.toString() + "/");
    this.usersBaseUri = normalizedBase.resolve("users/");
    this.loginUri = normalizedBase.resolve("login");
  }

  public Optional<LegacyUserRepresentation> fetchUser(String username) {
    try {
      URI target = usersBaseUri.resolve(encode(username));
      HttpRequest request =
          HttpRequest.newBuilder().uri(target).timeout(Duration.ofSeconds(5)).GET().build();

      HttpResponse<String> response =
          httpClient.send(request, HttpResponse.BodyHandlers.ofString());

      LOGGER.infof("LegacyUserService.fetchUser %s -> %d", target, response.statusCode());

      if (response.statusCode() == 404) {
        return Optional.empty();
      }

      if (response.statusCode() >= 200 && response.statusCode() < 300) {
        LegacyUserRepresentation representation =
            MAPPER.readValue(response.body(), LegacyUserRepresentation.class);
        LOGGER.infof(
            "LegacyUserService.fetchUser loaded user %s with %d roles",
            representation.getUsername(), representation.getRoles().size());
        return Optional.of(representation);
      }

      LOGGER.warnf(
          "Unexpected response when fetching user %s: %d %s",
          username, response.statusCode(), response.body());
      return Optional.empty();
    } catch (IOException | InterruptedException ex) {
      if (ex instanceof InterruptedException) {
        Thread.currentThread().interrupt();
      }
      LOGGER.errorf(ex, "Failed to fetch user %s from legacy system", username);
      return Optional.empty();
    }
  }

  public boolean validateCredentials(String username, String password) {
    try {
      String payload =
          MAPPER.writeValueAsString(Map.of("username", username, "password", password));
      HttpRequest request =
          HttpRequest.newBuilder()
              .uri(loginUri)
              .timeout(Duration.ofSeconds(5))
              .header("Content-Type", "application/json")
              .POST(HttpRequest.BodyPublishers.ofString(payload))
              .build();

      HttpResponse<String> response =
          httpClient.send(request, HttpResponse.BodyHandlers.ofString());
      LOGGER.infof(
          "LegacyUserService.validateCredentials %s -> %d", username, response.statusCode());
      return response.statusCode() == 200;
    } catch (IOException | InterruptedException ex) {
      if (ex instanceof InterruptedException) {
        Thread.currentThread().interrupt();
      }
      LOGGER.errorf(ex, "Failed to validate credentials for %s", username);
      return false;
    }
  }

  private static String encode(String value) {
    return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
  }
}
