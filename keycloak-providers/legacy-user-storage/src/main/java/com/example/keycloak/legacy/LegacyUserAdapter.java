package com.example.keycloak.legacy;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.keycloak.component.ComponentModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.storage.adapter.AbstractUserAdapterFederatedStorage;
import java.util.stream.Stream;

public class LegacyUserAdapter extends AbstractUserAdapterFederatedStorage {
    private final LegacyUserRepresentation delegate;

    public LegacyUserAdapter(
        KeycloakSession session,
        RealmModel realm,
        ComponentModel model,
        LegacyUserRepresentation delegate
    ) {
        super(session, realm, model);
        this.delegate = new LegacyUserRepresentation(Objects.requireNonNull(delegate));
    }

    @Override
    public String getUsername() {
        return delegate.getUsername();
    }

    @Override
    public void setUsername(String username) {
        // read-only
    }

    @Override
    public String getEmail() {
        return delegate.getEmail();
    }

    @Override
    public void setEmail(String email) {
        // read-only
    }

    @Override
    public String getFirstName() {
        String displayName = delegate.getDisplayName();
        if (displayName == null || displayName.isBlank()) {
            return null;
        }
        String[] parts = displayName.split(" ");
        return parts.length > 0 ? parts[0] : null;
    }

    @Override
    public void setFirstName(String firstName) {
        // read-only
    }

    @Override
    public String getLastName() {
        String displayName = delegate.getDisplayName();
        if (displayName == null || displayName.isBlank()) {
            return null;
        }
        String[] parts = displayName.split(" ");
        if (parts.length <= 1) {
            return null;
        }
        return String.join(" ", java.util.Arrays.copyOfRange(parts, 1, parts.length));
    }

    @Override
    public void setLastName(String lastName) {
        // read-only
    }

    @Override
    public boolean isEmailVerified() {
        return true;
    }

    @Override
    public Map<String, List<String>> getAttributes() {
        Map<String, List<String>> attributes = new HashMap<>();
        attributes.put(UserModel.USERNAME, Collections.singletonList(getUsername()));
        String email = getEmail();
        if (email != null) {
            attributes.put(UserModel.EMAIL, Collections.singletonList(email));
        }
        String first = getFirstName();
        if (first != null) {
            attributes.put(UserModel.FIRST_NAME, Collections.singletonList(first));
        }
        String last = getLastName();
        if (last != null) {
            attributes.put(UserModel.LAST_NAME, Collections.singletonList(last));
        }
        List<String> roles = delegate.getRoles();
        if (!roles.isEmpty()) {
            attributes.put("legacyRoles", roles);
        }
        return attributes;
    }

    @Override
    public Stream<String> getAttributeStream(String name) {
        if ("legacyRoles".equals(name)) {
            return delegate.getRoles().stream();
        }
        return super.getAttributeStream(name);
    }
}
