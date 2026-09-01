package ops

// Wire types for the homepage. IDs that are UUIDs in the DB stay strings
// here; delivery / shipping IDs are BIGSERIAL and stay int64.

type DeliveryStatus struct {
	ID               string  `json:"id"`
	Code             string  `json:"code"`
	Name             string  `json:"name"`
	Type             string  `json:"type"` // PROCESS | RESULT
	ColorHex         string  `json:"colorHex"`
	Icon             *string `json:"icon"`
	DisplayOrder     int     `json:"displayOrder"`
	FinishesDelivery bool    `json:"finishesDelivery"`
	AllowsReschedule bool    `json:"allowsReschedule"`
}

type Driver struct {
	ID       string `json:"id"`
	FullName string `json:"fullName"`
	Email    string `json:"email"`
}

type Address struct {
	ID         string  `json:"id"`
	ZipCode    *string `json:"zipCode"`
	Street     string  `json:"street"`
	Number     *string `json:"number"`
	District   *string `json:"district"`
	City       string  `json:"city"`
	State      string  `json:"state"`
	Complement *string `json:"complement"`
	Line       string  `json:"line"` // pre-composed single-line form for display
}

type Customer struct {
	ID        string    `json:"id"`
	FullName  string    `json:"fullName"`
	Phone     *string   `json:"phone"`
	Addresses []Address `json:"addresses"`
}

// Delivery is one stop inside a shipping.
type Delivery struct {
	ID            int64    `json:"id"`
	Order         int      `json:"order"`
	CustomerID    string   `json:"customerId"`
	CustomerName  string   `json:"customerName"`
	CustomerPhone *string  `json:"customerPhone"`
	AddressID     string   `json:"addressId"`
	AddressLine   string   `json:"addressLine"`
	Lat           *float64 `json:"lat"`
	Lng           *float64 `json:"lng"`
	StatusID      string   `json:"statusId"`
	StatusCode    string   `json:"statusCode"`
	StatusName    string   `json:"statusName"`
	StatusColor   string   `json:"statusColor"`
	AttemptNumber int      `json:"attemptNumber"`
	Notes         *string  `json:"notes"`
	StartedAt     *string  `json:"startedAt"`  // RFC3339, nil until started
	FinishedAt    *string  `json:"finishedAt"` // RFC3339, nil until finished
}

// ActiveDelivery points a driver back to the stop they left in progress.
type ActiveDelivery struct {
	ShippingID int64 `json:"shippingId"`
	DeliveryID int64 `json:"deliveryId"`
}

// ---- driver request bodies ----

type geoBody struct {
	Lat *float64 `json:"lat"`
	Lng *float64 `json:"lng"`
}

type finishReq struct {
	Outcome string   `json:"outcome"` // COMPLETE | ABSENT | TROUBLE
	Note    string   `json:"note"`
	Lat     *float64 `json:"lat"`
	Lng     *float64 `json:"lng"`
}

type Shipping struct {
	ID           int64      `json:"id"`
	BatchCode    string     `json:"batchCode"`
	DeliveryDate string     `json:"deliveryDate"` // YYYY-MM-DD
	DriverUserID string     `json:"driverUserId"`
	DriverName   string     `json:"driverName"`
	Notes        *string    `json:"notes"`
	Deliveries   []Delivery `json:"deliveries"`
}

type StatusCount struct {
	StatusID string `json:"statusId"`
	Code     string `json:"code"`
	Name     string `json:"name"`
	ColorHex string `json:"colorHex"`
	Count    int    `json:"count"`
}

// HomePayload is the whole GET /shippings?date=... response.
type HomePayload struct {
	Date          string        `json:"date"`
	Shippings     []Shipping    `json:"shippings"`
	StatusSummary []StatusCount `json:"statusSummary"`
}

// LinkableDelivery is a row in the "link an existing delivery" picker.
type LinkableDelivery struct {
	ID           int64  `json:"id"`
	CustomerName string `json:"customerName"`
	AddressLine  string `json:"addressLine"`
	StatusCode   string `json:"statusCode"`
	StatusName   string `json:"statusName"`
	StatusColor  string `json:"statusColor"`
	ShippingID   int64  `json:"shippingId"`
	BatchCode    string `json:"batchCode"`
}

// ---- request bodies ----

type createCustomerReq struct {
	FullName string        `json:"fullName"`
	Phone    *string       `json:"phone"`
	Address  *addressInput `json:"address"`
}

type addressInput struct {
	ZipCode    *string `json:"zipCode"`
	Street     string  `json:"street"`
	Number     *string `json:"number"`
	District   *string `json:"district"`
	City       string  `json:"city"`
	State      string  `json:"state"`
	Complement *string `json:"complement"`
}

type createShippingReq struct {
	DriverUserID string  `json:"driverUserId"`
	DeliveryDate string  `json:"deliveryDate"` // YYYY-MM-DD
	Notes        *string `json:"notes"`
}

type quickDeliveryReq struct {
	CustomerID string  `json:"customerId"`
	AddressID  string  `json:"addressId"`
	Notes      *string `json:"notes"`
}

type reorderReq struct {
	DeliveryIDs []int64 `json:"deliveryIds"`
}
