import hashlib
import secrets


N = 37
g = 5


def hash_to_int(text: str) -> int:
    """Turn a string into a small integer for this toy demo."""
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return int(digest, 16) % N


def derive_session_key(shared_secret: int) -> str:
    """Convert the shared secret into a printable session key."""
    return hashlib.sha256(str(shared_secret).encode("utf-8")).hexdigest()[:16]


class ToyServer:
    def __init__(self):
        self.users = {}

    def show_database(self) -> None:
        print("\n=== Server User Database ===")
        for username, record in self.users.items():
            print(
                f"{username}: salt={record['salt']}, verifier={record['verifier']}"
            )

    def register(self, username: str, password: str) -> None:
        print("\n=== Registration ===")
        salt = secrets.randbelow(1000) + 1
        x = hash_to_int(password + str(salt))
        verifier = pow(g, x, N)

        # The server identifies the account by username and stores the salt/verifier
        # with that exact record. The salt is not global; it belongs to this user.
        self.users[username] = {"salt": salt, "verifier": verifier}

        print(f"Password entered: {password}")
        print(f"Salt: {salt}")
        print(f"x = hash(password + salt) mod N: {x}")
        print(f"verifier = g^x mod N: {verifier}")
        print("Stored on server: salt and verifier")

    def login(self, username: str, password: str) -> bool:
        print("\n=== Login ===")
        if username not in self.users:
            print("Unknown user.")
            return False

        print(f"User id / username presented by client: {username}")
        salt = self.users[username]["salt"]
        verifier = self.users[username]["verifier"]

        print(f"Password entered: {password}")
        print(f"Salt sent by server: {salt}")
        print(f"Stored verifier on server: {verifier}")

        a = secrets.randbelow(N - 2) + 1
        b = secrets.randbelow(N - 2) + 1
        A = pow(g, a, N)
        B = pow(g, b, N)

        print(f"Client random a: {a}")
        print(f"Client public A = g^a mod N: {A}")
        print(f"Server random b: {b}")
        print(f"Server public B = g^b mod N: {B}")

        client_x = hash_to_int(password + str(salt))
        client_verifier = pow(g, client_x, N)

        print(f"Client recomputed x: {client_x}")
        print(f"Client recomputed verifier: {client_verifier}")

        # Toy SRP-like idea:
        # Both sides build a shared value from the Diffie-Hellman part
        # plus the password-derived verifier. If the password is wrong,
        # the client's verifier will not match the stored one.
        dh_client = pow(B, a, N)
        dh_server = pow(A, b, N)
        client_shared_secret = (dh_client + client_verifier) % N
        server_shared_secret = (dh_server + verifier) % N

        print(f"Client DH part: {dh_client}")
        print(f"Server DH part: {dh_server}")

        client_key = derive_session_key(client_shared_secret)
        server_key = derive_session_key(server_shared_secret)

        print(f"Client shared secret: {client_shared_secret}")
        print(f"Server shared secret: {server_shared_secret}")
        print(f"Client session key: {client_key}")
        print(f"Server session key: {server_key}")

        success = client_key == server_key
        print("Login success:" if success else "Login failure:", success)
        return success


def main() -> None:
    server = ToyServer()
    alice_password = "correct horse battery staple"
    bob_password = "blue turtle coffee"

    print("Toy PAKE-like Authentication Demo")
    print(f"N = {N}, g = {g}")

    server.register("alice", alice_password)
    server.register("bob", bob_password)
    server.show_database()

    print("\n--- Attempt 1: Alice correct password ---")
    server.login("alice", alice_password)

    print("\n--- Attempt 2: Alice incorrect password ---")
    server.login("alice", "wrong password")

    print("\n--- Attempt 3: Bob correct password ---")
    server.login("bob", bob_password)

    print("\n--- Attempt 4: Unknown username ---")
    server.login("charlie", "anything")


if __name__ == "__main__":
    main()