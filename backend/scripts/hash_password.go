//go:build ignore

// Run with: go run scripts/hash_password.go "YourPassword123!"
// Prints a bcrypt hash you can paste straight into a seed migration's
// password_hash column. Never commit real passwords — this is for
// generating dev/seed data only.
package main

import (
	"fmt"
	"os"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("usage: go run scripts/hash_password.go <password>")
		os.Exit(1)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(os.Args[1]), bcrypt.DefaultCost)
	if err != nil {
		fmt.Println("error:", err)
		os.Exit(1)
	}
	fmt.Println(string(hash))
}
