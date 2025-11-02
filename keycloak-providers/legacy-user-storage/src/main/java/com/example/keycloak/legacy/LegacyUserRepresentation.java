package com.example.keycloak.legacy;

import java.util.Collections;
import java.util.List;

public class LegacyUserRepresentation {
    private String username;
    private String displayName;
    private String email;
    private List<String> roles;

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
        this.roles = roles;
    }
}
