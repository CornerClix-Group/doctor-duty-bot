export const AVAILABLE_SHIFTS = [
  "D1", "D2", "MIDA", "MIDB", "E", "N", "FT AM", "FT PM", "FT W", "C", "A10"
];

export const generateProviderCSVTemplate = () => {
  const headers = [
    "first_name",
    "last_name",
    "email",
    "role",
    "rest_hours",
    "n_recovery_days",
    "allowed_shifts",
    "preferred_shifts",
    "saturday_restrictions",
    "sunday_restrictions",
    "block_pattern"
  ];

  const exampleRows = [
    [
      "John",
      "Smith",
      "john.smith@example.com",
      "provider",
      "12",
      "2",
      "D1|D2|E|N",
      "D1|D2",
      "none",
      "none",
      ""
    ],
    [
      "Jane",
      "Doe",
      "jane.doe@example.com",
      "provider",
      "12",
      "2",
      "D1|D2|MIDA|MIDB|E|N|FT AM",
      "D1|FT AM",
      "FT AM only",
      "FT AM only",
      ""
    ],
    [
      "Robert",
      "Johnson",
      "robert.j@example.com",
      "provider",
      "14",
      "2",
      "E|N",
      "N",
      "off",
      "off",
      "3-4 blocks"
    ]
  ];

  const csvContent = [
    headers.join(","),
    ...exampleRows.map(row => row.map(cell => `"${cell}"`).join(","))
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", "provider_import_template.csv");
  link.style.visibility = "hidden";
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
