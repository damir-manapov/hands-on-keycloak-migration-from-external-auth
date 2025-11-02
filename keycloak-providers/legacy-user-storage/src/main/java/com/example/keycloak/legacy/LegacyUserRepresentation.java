package com.example.keycloak.legacy;

import java.util.Collections;
import java.util.List;
import java.util.Objects;

public class LegacyUserRepresentation {
  private String username;
  private String displayName;
  private String email;
  private List<String> roles;

  public LegacyUserRepresentation() {
    // Default constructor for Jackson
  }

  public LegacyUserRepresentation(LegacyUserRepresentation source) {
    this.username = source.getUsername();
    this.displayName = source.getDisplayName();
    this.email = source.getEmail();
    this.roles =
        source.getRoles().isEmpty() ? Collections.emptyList() : List.copyOf(source.getRoles());
  }

  public String getUsername() {
    return username;
  }

  public void setUsername(String username) {
    this.username = username;
  }

  public String getDisplayName() {
    return displayName;
  }

  public void setDisplayName(String displayName) {
    this.displayName = displayName;
  }

  public String getEmail() {
    return email;
  }

  public void setEmail(String email) {
    this.email = email;
  }

  public List<String> getRoles() {
    return roles == null ? Collections.emptyList() : roles;
  }

  public void setRoles(List<String> roles) {
    if (roles == null || roles.isEmpty()) {
      this.roles = Collections.emptyList();
      return;
    }
    this.roles = List.copyOf(Objects.requireNonNull(roles));
  }
}
