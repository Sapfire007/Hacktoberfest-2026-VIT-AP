# 🚀 Fuzzy Search - Quick Start

## TL;DR

Faculty search now handles typos, misspellings, and word reordering.

**Example:**
- Search: `"Dr Verna"` (typo) → Finds `"Dr. Verma"` ✅
- Search: `"Kumar Anil"` → Finds `"Dr. Anil Kumar"` ✅
- Search: `"Computer Science"` → Finds all SCOPE faculty ✅

---

## 🎯 How to Use

### Option 1: Use the Component (Recommended)

```typescript
import { FacultySearchPicker } from '@/components/ui/FacultySearchPicker';

<FacultySearchPicker
  faculty={facultyList}
  selectedFaculty={selectedFaculty}
  onSelect={setSelectedFaculty}
/>
```

### Option 2: Use the Function

```typescript
import { searchFaculty } from '@/utils/fuzzySearch';

const results = searchFaculty(facultyList, 'Dr Verma');
// Returns: [{ item: {...}, score: 0.95, matchedField: 'name' }, ...]
```

---

## 📁 Where It's Used

1. **New Visit Request** (`app/(main)/requests/new.tsx`)
   - Faculty selection dropdown
   - Live search as you type

2. **Requests List** (`app/(main)/requests/index.tsx`)
   - Search bar with fuzzy matching
   - Searches destination, purpose, faculty name

---

## ⚙️ Configuration

### Adjust Match Sensitivity

**More strict** (fewer results, higher accuracy):
```typescript
searchFaculty(faculty, query, { threshold: 0.5 })
```

**More lenient** (more results, includes distant matches):
```typescript
searchFaculty(faculty, query, { threshold: 0.1 })
```

**Default: 0.25** (balanced)

### Limit Results

```typescript
searchFaculty(faculty, query, { limit: 10 })
```

### Search Specific Fields

```typescript
searchFaculty(faculty, query, {
  searchFields: ['name', 'email'],  // Only search name and email
})
```

---

## 🧪 Quick Test

```typescript
import { fuzzyMatchScore } from '@/utils/fuzzySearch';

// Test typo tolerance
console.log(fuzzyMatchScore('Dr. Anil Verma', 'Dr. Verna'));
// Output: ~0.78 (good match despite typo)

// Test word reordering
console.log(fuzzyMatchScore('Kumar Verma', 'Verma Kumar'));
// Output: ~0.92 (excellent match)
```

---

## 💡 Tips

1. **Debounce search input** (prevents lag)
   ```typescript
   const debouncedSearch = useMemo(
     () => debounce(setQuery, 300),
     []
   );
   ```

2. **Show result count** to users
   ```typescript
   <Text>{results.length} results found</Text>
   ```

3. **Display relevance scores** for transparency
   ```typescript
   {score < 0.9 && <Text>{Math.round(score * 100)}% match</Text>}
   ```

---

## 🐛 Troubleshooting

**No results returned?**
- Lower the threshold: `{ threshold: 0.2 }`
- Check faculty list is loaded
- Verify query is not empty

**Too many irrelevant results?**
- Raise the threshold: `{ threshold: 0.4 }`
- Reduce limit: `{ limit: 10 }`

**Search is slow?**
- Add debouncing (300ms)
- Reduce faculty list size
- Limit search fields

---

## 📚 Full Documentation

See `FUZZY_SEARCH_IMPLEMENTATION.md` for complete details.
